# Reddit post — NVIDIA SkillSpector + MCP servers

**Status:** ready to post (question-led)  
**Related Insight:** https://www.influzer.ai/insights/nvidia-skillspector-scan-skills-before-install  
**NVIDIA repo:** https://github.com/NVIDIA/SkillSpector  
**Disclosure:** we run influzer.ai — one sentence in the body, not a product tour.

---

## Why questions, not a lecture

The first draft told people how to use SkillSpector. That reads as a blog dump. On Reddit it underperforms and smells like promo.

A question-led post is better here because:

- SkillSpector is new. You do not actually know who is running it in anger.
- The interesting gap (skills vs hosted MCP) is something **operators** will argue about. Let them.
- Influzer learns more from “here’s where it false-positived on our GitHub MCP” than from upvotes on a how-to.
- You can still drop the playbook **later**, as a comment, if someone asks “so what do you do?”

Keep the body short: enough context that lurkers know what the tool is, then three questions. Do not answer your own questions in the post.

---

## Where to post

Post as a **text/self post**. One subreddit first; wait for replies before crossposting.

| Subreddit | Why | Title |
| --- | --- | --- |
| r/LocalLLaMA | Best technical discussion | **A** |
| r/ClaudeAI | People actually installing skills | **A** or **B** |
| r/mcp | Protocol-native; will argue MCP vs skills | **C** |
| r/cursor | `.cursor/mcp.json` crowd | **B** |
| r/netsec | Scanner / supply-chain angle | **D** |

Do **not** post the same body to r/MachineLearning or r/programming on day one.

---

## Title options (pick one)

**A (recommended):** Who’s actually using NVIDIA SkillSpector? And does it help at all with MCP servers?

**B:** SkillSpector before Claude/Cursor installs — who’s running it, and where does it fall short?

**C:** SkillSpector as an MCP (`scan_skill`) — useful guardrail or score theater for hosted servers?

**D:** NVIDIA says 26% of agent skills have vulns. Is anyone scanning them before install?

---

## Body (copy from here)

NVIDIA shipped SkillSpector as a static scanner for agent skills (`SKILL.md`, zip, git repo). It does not execute the skill. It returns a 0–100 risk score — prompt injection, hidden Unicode, tool poisoning in descriptions, CVEs via OSV, that kind of thing. Their research: 26.1% of skills in the wild have at least one vuln, 5.2% look malicious.

It also runs as an MCP server (`skillspector mcp`) with a single tool, `scan_skill`, so an agent can theoretically gate an install on the verdict.

We run influzer.ai (MCP directory). We are *not* putting SkillSpector scores on listings — most hosted MCPs have no cloneable tree, and a GitHub MCP that writes issues looks “excessive” to a skill linter. Curious whether that’s the right call, or too cautious.

If you’ve touched it:

1. **Who’s using it, and where?** CLI before a Claude Code skill? CI / SARIF? Wired as MCP so the agent calls `scan_skill`? Or you cloned it, ran it once, and it didn’t stick?

2. **How would you use it with MCP servers?** Scan the GitHub before it goes in `.cursor/mcp.json`? Ignore it for remote HTTPS connectors and only handshake `tools/list`? Pair it with a read-only discovery MCP so search ≠ install? Something else?

3. **Where does it fall short?** False positives on filesystem/shell/GitHub-write servers? Blind to hosted endpoints? LLM pass you don’t want sending an untrusted zip to a provider? Scores that look more certain than they are? Anything it caught that a human review missed?

Not looking for a “safe” badge. Looking for whether this is a real pre-install gate or just a nicer grep.

Repo: https://github.com/NVIDIA/SkillSpector

---

## First comment (links only — do not lecture here)

Keep this thin. If you paste the playbook first, you killed the thread.

> Docs: https://docs.nvidia.com/skills/scanning-agent-skills  
> We wrote up the skills-vs-MCP split here (why we won’t badge listings): https://www.influzer.ai/insights/nvidia-skillspector-scan-skills-before-install

---

## Follow-up comment (only if someone asks “so what do *you* do?”)

Do not post this with the thread. Wait.

> What we’d actually run:
>
> 1. Read-only discovery MCP to *search* (we expose https://www.influzer.ai/mcp/discovery — it does not install anything).
> 2. SkillSpector on cloneable source, `--no-llm` first, gate on high/critical. `claude mcp add skillspector -- skillspector mcp` if you want the agent to call `scan_skill`.
> 3. Handshake the live process (`initialize` + `tools/list`). A clean GitHub is not a clean hosted URL. HTTP SkillSpector has no auth — bind `127.0.0.1`.
> 4. Human allowlist before `.cursor/mcp.json` / Claude Connect. Default deny writes.
>
> SkillSpector is step 2. It is not a sandbox and it cannot certify an HTTPS connector it cannot clone. NVIDIA says defense-in-depth; that matches what we see.

---

## Shorter variant (r/mcp)

**Title:** Anyone using SkillSpector on MCP servers, or only on `SKILL.md`?

NVIDIA SkillSpector scans skill packs (static, optional LLM). Also speaks MCP via `scan_skill`.

We run a directory (influzer.ai) and are deliberately *not* stamping scores on listings — no source tree for most remote MCPs, and write-capable servers look “too agency” to a skill linter.

Genuinely asking:

- Are you running it in CI, as MCP, or not at all?
- Would you scan an MCP GitHub before it hits `mcp.json`?
- What’s the miss: hosted endpoints, false positives, score theater?

Repo: https://github.com/NVIDIA/SkillSpector

---

## Do not

- Answer the three questions in the same post.
- Lead with Influzer Discovery setup steps.
- Crosspost the identical body to five subs in one hour.
- Claim Influzer “uses SkillSpector on every listing.” We don’t. We use SkillSpector-shaped poison checks on text we already store.
- Call a 0–20 score “verified” or “NVIDIA-safe.”
- Drop the follow-up playbook as the first comment. Let other people talk first.
