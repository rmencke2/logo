#!/usr/bin/env bash
#
# Commit staged workflow outputs and push to the current branch with
# fetch + rebase + retry, so overlapping scheduled jobs do not fail on
# non-fast-forward pushes.
#
# Usage:
#   scripts/ci-commit-push.sh "commit message" file1 [file2 ...]
#
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 \"commit message\" file1 [file2 ...]" >&2
  exit 2
fi

MSG="$1"
shift

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "$@"
if git diff --staged --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$MSG"

BRANCH="${GITHUB_REF_NAME:-main}"
REMOTE_REF="origin/${BRANCH}"
MAX_ATTEMPTS="${CI_PUSH_MAX_ATTEMPTS:-5}"
DELAY="${CI_PUSH_INITIAL_DELAY_SEC:-2}"

abort_rebase_if_needed() {
  if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
    git rebase --abort || true
  fi
}

# npm ci / build steps often dirty tracked paths (notably committed node_modules
# bins). Rebase refuses to start with unstaged changes — discard that noise
# after our payload commit so push retries can proceed.
clean_working_tree_for_rebase() {
  if [[ -z "$(git status --porcelain)" ]]; then
    return 0
  fi
  echo "Working tree dirty before rebase; discarding unstaged noise:"
  git status --porcelain | head -n 50
  git reset --hard HEAD
  # Untracked files rarely block rebase; leave them unless a path we commit is
  # about to be overwritten (handled by rebase itself).
}

resolve_rebase_preferring_ours() {
  # During rebase, "theirs" is the commit being replayed (this job's output).
  local path
  local had_unmerged=0
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    had_unmerged=1
    git checkout --theirs -- "${path}"
    git add -- "${path}"
  done < <(git diff --name-only --diff-filter=U)

  if [[ "${had_unmerged}" -eq 0 ]]; then
    return 1
  fi

  GIT_EDITOR=true git rebase --continue
}

for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  echo "==> Push attempt ${attempt}/${MAX_ATTEMPTS} to ${REMOTE_REF}"
  clean_working_tree_for_rebase
  git fetch origin "${BRANCH}"

  # --autostash covers any race where the tree dirties again between clean and rebase
  if git rebase --autostash "${REMOTE_REF}"; then
    if git push origin "HEAD:${BRANCH}"; then
      echo "Push succeeded on attempt ${attempt}."
      exit 0
    fi
    echo "Push rejected after clean rebase; retrying..."
  else
    echo "Rebase conflict; preferring this job's versions of committed paths..."
    if resolve_rebase_preferring_ours && git push origin "HEAD:${BRANCH}"; then
      echo "Push succeeded on attempt ${attempt} after conflict resolution."
      exit 0
    fi
    echo "Rebase/push still failing; aborting rebase before retry..."
    abort_rebase_if_needed
  fi

  if [[ "${attempt}" -eq "${MAX_ATTEMPTS}" ]]; then
    break
  fi
  echo "Sleeping ${DELAY}s before retry..."
  sleep "${DELAY}"
  DELAY=$((DELAY * 2))
done

abort_rebase_if_needed
echo "ERROR: failed to push after ${MAX_ATTEMPTS} attempts." >&2
exit 1
