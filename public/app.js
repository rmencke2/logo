const nameInput = document.getElementById('name');
const styleSelect = document.getElementById('style');
const fontColorInp = document.getElementById('fontColor');
const bgColorInp = document.getElementById('bgColor');
const btn = document.getElementById('generateBtn');
const previewDiv = document.getElementById('preview');

async function generateLogo() {
  const name = nameInput.value.trim();
  const style = styleSelect.value.toLowerCase();
  const fontColor = fontColorInp.value;
  const bgColor = bgColorInp.value;

  if (!name) {
    alert('Please enter a business name.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Loading…';
  previewDiv.innerHTML = '<p>Generating…</p>';

  console.log('🛰️ Sending generate-logo:', { name, style, fontColor, bgColor });

  try {
    const res = await fetch('/generate-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, style, fontColor, bgColor }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { svgPath, pngPath } = await res.json();

    console.log('✅ Logo paths:', svgPath, pngPath);
    previewDiv.innerHTML = `
      <img src="${pngPath}" alt="Logo Preview (PNG)" />
      <div class="downloads">
        <a href="${svgPath}" download>Download SVG</a>
        <a href="${pngPath}" download>Download PNG</a>
      </div>
    `;
  } catch (err) {
    console.error('❌ Generation error:', err);
    previewDiv.innerHTML = '<p style="color:red;">Failed to generate logo. See console.</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Logo';
  }
}

btn.addEventListener('click', () => {
  console.log('🔘 Generate button clicked');
  generateLogo();
});

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const n = params.get('name');
  if (n) {
    nameInput.value = n;
    setTimeout(generateLogo, 100);
  }
});
