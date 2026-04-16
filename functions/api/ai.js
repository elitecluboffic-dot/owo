export async function handleAI(interaction, env, respond) {
    const options = interaction.data.options || [];
    const cmd = interaction.data.name;
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const username = interaction.member?.user?.username || interaction.user?.username || 'User';

    if (cmd === 'ai') {
        const pertanyaan = options.find(o => o.name === 'pertanyaan')?.value;
        if (!pertanyaan) {
            return respond('❌ Tulis pertanyaanmu dulu!');
        }

        const userId = discordId;
        const usernameDisplay = username;
        const cooldownKey = `ai_cd:${userId}`;
        const historyKey = `ai_history:${userId}`;

        // Cooldown
        const lastUsed = await env.USERS_KV.get(cooldownKey);
        if (lastUsed) {
            const sisa = 60000 - (Date.now() - parseInt(lastUsed));
            if (sisa > 0) {
                const detik = Math.ceil(sisa / 1000);
                return respond(`⏳ Kamu terlalu cepat! Coba lagi dalam **${detik} detik**.`);
            }
        }
        await env.USERS_KV.put(cooldownKey, String(Date.now()), { expirationTtl: 70 });

        // Defer
        await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 5 })
        });

        try {
            let history = [];
            const saved = await env.USERS_KV.get(historyKey);
            if (saved) history = JSON.parse(saved);

            history.push({ role: "user", content: pertanyaan });
            if (history.length > 12) history = history.slice(-12);

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.GROQ_API_KEY || env.GROQ_KEY || env.AI_API_KEY || env.API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: 'system',
                            content: `Kamu adalah Jarvis, asisten AI yang cerdas, ramah, dan sedikit humoris.\nKamu menjawab dalam bahasa yang sama dengan pengguna (Indonesia atau Inggris).\nJawaban kamu singkat, padat, dan mudah dipahami. Gunakan emoji secukupnya.`
                        },
                        ...history
                    ],
                    max_tokens: 1024,
                    temperature: 0.7
                })
            });

            if (!groqRes.ok) throw new Error(`Groq error ${groqRes.status}`);

            const groqData = await groqRes.json();
            let jawaban = groqData.choices?.[0]?.message?.content?.trim() 
                || '❌ Maaf, aku lagi bingung nih. Coba lagi ya!';

            history.push({ role: "assistant", content: jawaban });

            await env.USERS_KV.put(historyKey, JSON.stringify(history), { expirationTtl: 3600 });

            const embed = {
                color: 0x5865F2,
                author: { name: '🤖 Jarvis' },
                description: jawaban.length > 4000 ? jawaban.slice(0, 4000) + '\n...' : jawaban,
                fields: [{
                    name: '❓ Pertanyaan',
                    value: `\`\`\`${pertanyaan.slice(0, 200)}${pertanyaan.length > 200 ? '...' : ''}\`\`\``,
                    inline: false
                }],
                footer: {
                    text: `Ditanya oleh ${usernameDisplay} • Gunakan /reset untuk hapus riwayat`
                },
                timestamp: new Date().toISOString()
            };

            await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID || env.CLIENT_ID}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });

        } catch (err) {
            console.error('AI Error:', err);
            await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID || env.CLIENT_ID}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: '❌ Jarvis lagi sibuk atau ada masalah. Coba lagi sebentar ya!'
                })
            });
        }

        return new Response(null, { status: 202 });
    }

    // Reset
    if (cmd === 'reset') {
        await env.USERS_KV.delete(`ai_history:${discordId}`);
        return respond([
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[2;34m║ \u001b[1;32m✅ RIWAYAT BERHASIL DIRESET! ✅\u001b[0m \u001b[2;34m║\u001b[0m',
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            '> Riwayat percakapan dengan **Jarvis** sudah dihapus.'
        ].join('\n'));
    }
}
