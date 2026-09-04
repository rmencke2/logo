# Reddit post — NVIDIA SkillSpector + MCP servers

**Status:** ready to post  
**Related Insight:** https://www.influzer.ai/insights/nvidia-skillspector-scan-skills-before-install  
**NVIDIA repo:** https://github.com/NVIDIA/SkillSpector  
**Disclosure:** we run influzer.ai — say so in the post, not only in comments.

---

## Where to post

Post as a **text/self post**, not a link dump. One subreddit first; wait for replies before crossposting.

| Subreddit | Why | Title to use |
| --- | --- | --- |
| r/LocalLLaMA | Best technical discussion | **A** |
| r/ClaudeAI | Skill + MCP installers live here | **A** or **B** |
| r/mcp | Protocol-native audience | **C** |
| r/cursor | `.cursor/mcp.json` crowd | **B** |
| r/netsec | If you want the scanner angle, not MCP | **D** |

Do **not** post the same body to r/MachineLearning or r/programming on day one — those will treat it as promo.

---

## Title options (pick one)

**A (recommended):** NVIDIA SkillSpector is not a “safe MCP” badge. Here’s how it should actually be used with MCP servers.

**B:** Don’t paste a SKILL.md or `npx` MCP into Claude/Cursor until you scan it. The interesting part is SkillSpector *as* an MCP.

**C:** Pair SkillSpector MCP (`scan_skill`) with a discovery MCP. Search → scan → allowlist. Never search → install.

**D:** 26% of agent skills in the wild have vulns. NVIDIA’s SkillSpector is the first public scanner — and it also speaks MCP.

---

## Body (copy from here)

NVIDIA open-sourced SkillSpector so you can scan an agent skill *before* it lands in Claude Code, Codex, or Gemini. That part is getting the headlines.

The useful part for people actually wiring agents: **it also runs as an MCP server.** One tool, `scan_skill`. You can make the agent scan the thing it wants to install, and you can refuse the install if the verdict is high/critical.

Most people will still use it wrong. They’ll either (a) never run it, or (b) treat a green score as “this hosted MCP is safe, stamp it on the directory.” Those are different objects.

### What SkillSpector actually is

Static linter for skill packs. You point it at a Git repo, zip, directory, or `SKILL.md`. It does **not** execute the skill. It greps, walks Python ASTs, runs YARA, optionally sends file contents to an LLM, and returns a 0–100 risk score plus findings.

NVIDIA’s own numbers (cited in the repo): **26.1% of skills in the wild have at least one vulnerability**, **5.2% look outright malicious.** The scanner covers 70+ patterns, including the MCP-shaped ones: least-privilege mismatches and **tool poisoning** in descriptions (hidden Unicode, HTML comments, instruction-override copy).

CLI, no LLM, contents stay on the machine:

```bash
uv tool install git+https://github.com/NVIDIA/SkillSpector.git
skillspector scan ./my-skill/ --no-llm
```

Use the LLM pass when you want description-vs-code mismatch. Use `--no-llm` in CI and on untrusted zips you do not want leaving the laptop. NVIDIA is explicit: with LLM analysis on, file contents go to the configured provider.

### The MCP version (this is the product-shaped bit)

```bash
uv tool install --force 'skillspector[mcp] @ git+https://github.com/NVIDIA/SkillSpector.git'
claude mcp add skillspector -- skillspector mcp
```

Or HTTP for a remote runtime:

```bash
skillspector mcp --transport http --host 127.0.0.1 --port 8000
```

`scan_skill(target)` returns `risk_score`, `severity`, `recommendation`, `safe_to_install`, `findings`, plus `llm_used` / `scan_mode` so a static-only 12 is never mistaken for a full semantic scan.

Two gotchas from their README, because people will skip them:

1. HTTP transport ships **without auth**. Bind `127.0.0.1` or sit it behind a proxy. Over HTTP, local paths and `file://` are rejected on purpose so a random caller cannot read your disk.
2. A 0–20 score means “no matched patterns in the files we could read.” Not “harmless once installed.” Not “the hosted URL with the same name is clean.” Not “auth/scopes are fine for your org.” It cannot see compiled binaries, text in images, or runtime behavior. A remote HTTPS MCP with no cloneable tree is mostly outside the tool — which is most production connectors.

NVIDIA calls it defense-in-depth, not a sandbox. Believe them.

### How it should be used *with* MCP servers

The failure mode I keep seeing: agent can search a registry, then “helpfully” install whatever it found. Search became install. That’s how you get a mystery `npx` in `.cursor/mcp.json` and a write tool nobody reviewed.

The loop that actually works:

1. **Search** with a read-only discovery MCP. Capability in, shortlist out. No secrets, no filesystem, no connect.
2. **Scan** cloneable source with SkillSpector (`--no-llm` first, then LLM if you trust the provider with the files). Gate on high/critical.
3. **Handshake** the live process: `initialize` + `tools/list`. A pretty GitHub is not a pretty hosted URL. A 401 still counts as alive — that’s usually OAuth, not a dead server.
4. **Allowlist** in git. New server = PR to the list, then to `mcp.json`. Default deny writes. Humans own the connect step.

SkillSpector is step 2. It is not steps 1, 3, or 4.

Concrete pairing we run at influzer.ai (disclosure: that’s us — MCP directory + a read-only Discovery server):

- Discovery MCP at `https://www.influzer.ai/mcp/discovery` — search / recommend / fetch setup metadata. It does **not** install anything.
- SkillSpector MCP locally — scan the Git URL or zip before it hits Claude Code.
- Directory quality bar stays MCP-shaped: live `tools/list` (401 = alive), indexed tools over star count, poison pass on submissions (hidden Unicode, HTML comments, “ignore previous instructions”), strip zero-width chars on ingest. **No public SAFE badge.**

We will not stamp SkillSpector scores on 12k listings. Roughly 40% of them even have a GitHub URL. A skill linter will also flag *legitimate* MCP servers whose job is filesystem, shell, or GitHub writes — that’s “excessive agency” to a skill scanner and “the product” to the operator. Auto-dropping HIGH scores would hide the useful write tools and miss the failure mode that actually bites: a live `tools/list` description that lies, or a hosted endpoint whose README is cleaner than the process.

So: promote the scanner to skill installers. Steal NVIDIA’s *sequencing* (scan → evaluate → then publish). Do not fake the signature on a catalog card.

### 15-minute setup if you install skills *and* MCP

1. `skillspector scan <path> --no-llm` before any skill hits Claude Code.
2. Add SkillSpector as an MCP so the agent can call `scan_skill` instead of you copy-pasting.
3. Connect a discovery MCP so “is there an MCP for X?” is a search, not a hallucinated `npx`.
4. Pin a short allowlist next to `.cursor/mcp.json`. If it’s not on the list, it doesn’t get connected.
5. Treat every tool description as an untrusted string. Because it is.

If you only connect a handful of official remote MCPs, SkillSpector will not see those endpoints. Handshake + allowlist is the whole game. If you install third-party `SKILL.md` packs, run the static pass every time. If you have a cloneable MCP repo, do both — scan the tree, then handshake the process you will actually call.

Scan the files you can clone. Handshake the process you will actually call. Never let search become install.

---

## First comment (post this immediately)

Paste this as the first comment so the body stays a discussion, not a link farm.

> NVIDIA repo: https://github.com/NVIDIA/SkillSpector  
> Scan guide: https://docs.nvidia.com/skills/scanning-agent-skills  
> Longer split (what a score means, why we won’t badge listings): https://www.influzer.ai/insights/nvidia-skillspector-scan-skills-before-install  
> Discovery MCP setup (search-not-install): https://www.influzer.ai/mcp/discovery/setup  
>  
> We run the directory. Not asking anyone to trust a score we can’t compute on a hosted URL.

---

## Shorter variant (r/mcp, if the long post feels heavy)

**Title:** SkillSpector as an MCP (`scan_skill`) is the interesting part. Don’t badge directories “SAFE.”

NVIDIA SkillSpector is a static scanner for agent skills (`SKILL.md`, zip, git). 26% of skills in the wild have vulns per their research. It also ships as MCP:

```
uv tool install --force 'skillspector[mcp] @ git+https://github.com/NVIDIA/SkillSpector.git'
claude mcp add skillspector -- skillspector mcp
```

One tool: `scan_skill`. Gate the install on high/critical. `--no-llm` keeps contents on the machine.

How to use it **with** other MCP servers, not instead of them:

1. Discovery MCP = search (read-only). Example we run: https://www.influzer.ai/mcp/discovery
2. SkillSpector MCP = scan cloneable source.
3. `tools/list` handshake on the live endpoint.
4. Human allowlist before `.cursor/mcp.json` / Claude Connect.

A green SkillSpector score is not “this HTTPS connector is safe.” Most production MCPs have no cloneable tree. A GitHub MCP that writes issues will look “excessive” to a skill linter — that’s the product, not malware.

We will not put a SAFE chip on influzer.ai listings. Poison-pattern review on submissions (hidden Unicode, HTML comments, instruction-override copy) + live ingest, yes. Fake certification, no.

Scan files you can clone. Handshake the process you’ll call. Never let search become install.

---

## Do not

- Crosspost the identical body to five subs in one hour.
- Lead with “we launched.” Lead with the split (skill scan ≠ MCP handshake).
- Claim Influzer “uses SkillSpector on every listing.” We don’t. We use SkillSpector-shaped poison checks on text we already store.
- Call a 0–20 score “verified” or “NVIDIA-safe.”
