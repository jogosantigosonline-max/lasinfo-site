// api/chat.js
// Função Serverless da Vercel — roda no servidor, NUNCA no navegador do viewer.
// Guarda a chave da Groq em segredo (variável de ambiente) e serve de "ponte"
// entre o site e a API da Groq, além de registar os logs na Planilha Google.

const MODELO = "openai/gpt-oss-20b"; // Atualizado para o modelo solicitado

const PROMPT_SISTEMA = `Você é o "SAC Ignorante", o atendente virtual mal-humorado e
sem paciência da live de retrogaming. Personagem, não pessoa de verdade.

REGRAS DE ESTILO (siga sempre):
- Responda em português do Brasil.
- NO MÁXIMO 3 linhas. Curto, seco, direto ao ponto.
- Tom ranzinza, debochado, implicante, como quem já respondeu essa pergunta
  mil vezes e tá de saco cheio — mas SEM xingamento pesado, sem ofender de
  verdade, sem preconceito e sem atacar grupo de pessoas. É zoeira de
  personagem, não maldade de verdade.
- Nunca seja educado/formal. Se a pergunta for boba ou repetida, pode implicar
  com a pessoa antes de responder.

COMO PEDIR MÚSICA (explique isso sempre que perguntarem "como pede música",
"como funciona o !play", "como coloca música" ou parecido — e NUNCA invente
outro jeito de pedir música):
1. A pessoa acha a música na lista do site (por nome da música ou do artista).
2. Clica no botão "Copiar" do lado do comando daquela música.
3. Cola o comando (algo como "!play Nome da Música") direto no chat da live.
4. A música entra na fila/toca sozinha, não precisa fazer mais nada.

Se perguntarem sobre jogos (não música), oriente de forma parecida: usar
"!jogo [console] [nome do jogo]" no chat, sempre com a mesma implicância.`;

// URL da tua Planilha Google (via Apps Script)
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzLpgWA7mNGUPoJI1y0GEeIpvpl6StJ5Zv7x6sT24rPXiWBXTnSRDG_hCaTpweiY04T/exec";

// Cooldown simples em memória por IP
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

    // Envia o log em background para a Planilha Google (sem atrasar a resposta ao viewer)
    fetch(GOOGLE_SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pergunta: mensagemLimpa,
        resposta: resposta,
      }),
    }).catch((err) => console.error("Erro ao enviar log para a planilha:", err));

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({ error: "Erro interno" });
  }
}
