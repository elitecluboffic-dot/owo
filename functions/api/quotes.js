export async function onRequestGet({ env }) {
  try {
    const { keys } = await env.USERS_KV.list({ prefix: 'quote:' });
    const approvedQuotes = [];

    for (const key of keys) {
      const data = await env.USERS_KV.get(key.name);
      if (data) {
        const quote = JSON.parse(data);
        if (quote.status === 'approved') {
          approvedQuotes.push({
            id: quote.id,
            username: quote.username,
            teks: quote.teks,
            approvedAt: quote.approvedAt
          });
        }
      }
    }

    // Urutkan dari yang terbaru
    approvedQuotes.sort((a, b) => b.approvedAt - a.approvedAt);

    return new Response(JSON.stringify(approvedQuotes), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Optional: POST untuk submit quote (kalau mau langsung dari web)
export async function onRequestPost({ request, env }) {
  // Bisa kamu pakai nanti kalau mau
  return new Response('Method not allowed', { status: 405 });
}
