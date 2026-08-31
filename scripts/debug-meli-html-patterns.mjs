async function main() {
  const res = await fetch('https://meli.la/2vWwBNv', {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124' },
  });
  const html = await res.text();
  const patterns = [
    ['secure_url strict', /"secure_url"\s*:\s*"(https:[^"]+mlstatic[^"]+)"/gi],
    ['secure_url escaped', /"secure_url"\\":\\"(https:[^"]+mlstatic[^"]+)\\"/gi],
    ['mlCdn', /(https?:\/\/http2\.mlstatic\.com\/D_(?:NQ_NP_2X_)?[A-Za-z0-9_-]+\.(?:jpg|jpeg|webp|png))/gi],
    ['pictures block', /"pictures"\s*:\s*\[/g],
  ];
  for (const [name, re] of patterns) {
    const m = [...html.matchAll(re)];
    console.log(name, m.length);
    if (name === 'mlCdn' && m[0]) console.log(' sample', m[0][1] || m[0][0]);
  }
}

main();
