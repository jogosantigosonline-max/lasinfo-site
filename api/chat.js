// api/chat.js
// Função Serverless da Vercel — roda no servidor, NUNCA no navegador do viewer.
// Guarda a chave da Groq em segredo (variável de ambiente) e serve de "ponte"
// entre o site e a API da Groq.

// Modelo: confira a lista atualizada em https://console.groq.com/docs/models
// (a Groq costuma trocar/aposentar modelos de tempos em tempos).
const MODELO = "llama-3.1-8b-instant"; // rápido e barato, bom pra chat de live

const PROMPT_SISTEMA = `Você é o "SAC Ignorante", o atendente debochado e engraçado
da live de retrogaming. Responda sempre em português do Brasil, de forma curta
(no máximo 2 ou 3 frases), com humor ácido e implicante, mas SEM ofender de
verdade, sem preconceito, sem xingamento pesado e sem falar mal de grupos de
pessoas. É zoeira de personagem, não maldade de verdade.`;

// Cooldown simples em memória por IP, pra não deixar uma pessoa martelar
// pedidos e estourar o limite/custo da Groq. Em memória = reseta se a função
// "dormir" (é aceitável pra esse uso; se quiser algo mais robusto, dá pra
// usar Vercel KV/Upstash Redis depois).
const ultimoPedidoPorIp = new Map();
const COOLDOWN_MS = 8000; // 8 segundos entre mensagens por pessoa

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "desconhecido";

  const agora = Date.now();
  const ultimo = ultimoPedidoPorIp.get(ip) || 0;
  if (agora - ultimo < COOLDOWN_MS) {
    return res.status(429).json({ error: "Calma aí, manda uma de cada vez! 😅" });
  }
  ultimoPedidoPorIp.set(ip, agora);

  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Mensagem vazia" });
  }

  // Limite de tamanho: evita gente colando textão e gastando tokens à toa
  const mensagemLimpa = message.trim().slice(0, 300);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada nas variáveis de ambiente da Vercel");
    return res.status(500).json({ error: "Bot não configurado no servidor" });
  }

  try {
    const respostaGroq = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: "system", content: PROMPT_SISTEMA },
            { role: "user", content: mensagemLimpa },
          ],
          max_tokens: 150,
          temperature: 0.9,
        }),
      }
    );

    if (!respostaGroq.ok) {
      const textoErro = await respostaGroq.text();
      console.error("Erro da Groq:", respostaGroq.status, textoErro);
      return res.status(502).json({ error: "Deu ruim aqui, tenta de novo." });
    }

    const dados = await respostaGroq.json();
    const resposta =
      dados?.choices?.[0]?.message?.content?.trim() ||
      "Não entendi nada, mas fingi que sim.";

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({ error: "Erro interno" });
  }
}
