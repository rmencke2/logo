(function () {
  const form = document.getElementById('mcpClaimForm');
  const resultEl = document.getElementById('claimResult');
  if (!form || !resultEl) return;

  const csrf = form.querySelector('input[name="_csrf"]')?.value || '';

  function proofLines(claim) {
    const evidence = claim.evidence || {};
    const email = evidence.emailDomain || {};
    const owners = evidence.ownersFile || {};
    const site = evidence.siteFile || {};
    const github = evidence.githubFile || {};
    const lines = [];

    if (claim.status === 'approved') {
      lines.push('Ownership verified. You can edit this listing now.');
      lines.push(`Open My listings: ${claim.myListingsUrl || '/mcp/my-listings'}`);
      lines.push('');
    }

    lines.push(
      email.pass
        ? `Email domain ${email.domain} matches ${email.host}.`
        : `Email domain ${email.domain || '(none)'} does not match the listing host.`,
      owners.pass
        ? `Found your email in owners.json at ${owners.url}.`
        : `owners.json not confirmed${owners.url ? ` (${owners.url})` : ''}.`,
      site.pass
        ? `Found the one-time code at ${site.url}.`
        : `One-time site file not confirmed${site.url ? ` (${site.url})` : ''}.`,
      github.pass
        ? `Found the one-time code in ${github.repo}.`
        : `GitHub proof file not confirmed${github.repo ? ` (${github.repo})` : ''}.`,
    );

    if (claim.status === 'approved') {
      return lines.join('\n');
    }

    if (!evidence.anyPass) {
      lines.push('');
      lines.push('Publish one of these free, non-rendered proof files, then re-check:');
      lines.push('');
      lines.push('1) Preferred — permanent owners.json (lists your signed-in email):');
      lines.push('{');
      lines.push('  "$schema": "https://verifymcp.io/schemas/owners.json",');
      lines.push('  "owners": ["the-email-on-this-account"]');
      lines.push('}');
      (claim.ownersUrls || []).forEach((url) => lines.push(`   → ${url}`));
      lines.push('');
      lines.push('2) One-time website file (plain text, exact line):');
      lines.push(claim.claimLine);
      (claim.proofUrls || []).forEach((url) => lines.push(`   → ${url}`));
      if (github.repo) {
        lines.push('');
        lines.push(`3) Or commit that same line to ${github.repo} at .well-known/influzer-claim.txt on the default branch.`);
      }
      lines.push('');
      lines.push('No visible badge and no paid service — just the file.');
    } else {
      lines.push('');
      lines.push('Proof passed but this claim still needs a person at Influzer (usually another owner is set).');
    }
    return lines.join('\n');
  }

  function show(claim) {
    resultEl.hidden = false;
    resultEl.textContent = '';
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.margin = '0 0 12px';
    pre.textContent = proofLines(claim);
    resultEl.appendChild(pre);

    if (claim.status === 'approved') {
      const link = document.createElement('a');
      link.className = 'mcp-submit-btn';
      link.href = claim.myListingsUrl || '/mcp/my-listings';
      link.textContent = 'Go to My listings';
      resultEl.appendChild(link);
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mcp-submit-btn';
    button.textContent = 'Re-check proof';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const res = await fetch(`/api/mcp/claims/${encodeURIComponent(claim.id)}/recheck`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: '{}',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Recheck failed');
        show(data.claim);
      } catch (err) {
        button.disabled = false;
        const msg = document.createElement('p');
        msg.textContent = err.message || 'Recheck failed';
        resultEl.appendChild(msg);
      }
    });
    resultEl.appendChild(button);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('claimSubmit');
    button.disabled = true;
    resultEl.hidden = false;
    resultEl.textContent = 'Checking the listing…';
    try {
      const res = await fetch('/api/mcp/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          slug: document.getElementById('claimSlug').value.trim().toLowerCase(),
          relationship: document.getElementById('claimRelationship').value,
          note: document.getElementById('claimNote').value.trim(),
          githubLogin: document.getElementById('claimGithub').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');
      show(data.claim);
      if (data.claim.status !== 'approved') button.disabled = false;
    } catch (err) {
      resultEl.textContent = err.message || 'Claim failed';
      button.disabled = false;
    }
  });
})();
