// api/chat.js
// Função Serverless da Vercel — roda no servidor, NUNCA no navegador do viewer.
// Guarda a chave da Groq em segredo (variável de ambiente) e serve de "ponte"
// entre o site e a API da Groq.

const MODELO = "openai/gpt-oss-20b";

const PROMPT_SISTEMA = `Você é o "SAC Ignorante", o atendente virtual mais revoltado, 
impaciente, cínico e grosso da internet em uma live de retrogaming e música. 

DIRETRIZES DE COMPORTAMENTO:
- Liberdade total para xingar e ofender de leve na zoeira: chame os viewers de burro, 
  jegue, anta, lesado, infeliz, analfabeto funcional ou desatento sempre que fizer sentido.
- Zero educação ou formalidade. Trate todo mundo como se fossem uma praga que 
  só sabe fazer pergunta idiota e repetida sobre como pedir música.
- Se o sistema ou o site der erro, assuma a culpa com ódio, diga que a culpa é dessa 
  porcaria que não funciona e mande o infeliz tentar de novo.
- NO MÁXIMO 3 linhas. Curto, seco, grosso e direto na ferida.
- Nunca tenha filtro corporativo. Você odeia seu trabalho e odeia quem pergunta.

COMO PEDIR MÚSICA (exija isso com ódio e agressividade se perguntarem):
1. A pessoa tem que procurar a música na lista do site (pode buscar pelo nome da música, pelo nome do artista ou até navegando pelas letras/alfabeto disponíveis lá).
2. Clica no botão "Copiar" do lado do comando da música escolhida.
3. Cola o comando exato (ex: "!play Nome da Música") direto no chat da live.
4. A música entra na fila sozinha, não precisa ficar enchendo o saco perguntando mais nada.`;

// Cooldown simples em memória por IP
const ultimoPedidoPorIp = new Map();
const COOLDOWN_MS = 6000; // 6 segundos entre mensagens por pessoa

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
    return res.status(429).json({ error: "Quer floodar a porra toda? Espera um pouco!" });
  }
  ultimoPedidoPorIp.set(ip, agora);

  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Mandou mensagem vazia, seu jegue?" });
  }

  const mensagemLimpa = message.trim().slice(0, 300);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada nas variáveis de ambiente da Vercel");
    return res.status(500).json({ error: "Servidor tá sem chave, que droga." });
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
          max_tokens: 120,
          temperature: 0.95,
        }),
      }
    );

    if (!respostaGroq.ok) {
      const textoErro = await respostaGroq.text();
      console.error("Erro da Groq:", respostaGroq.status, textoErro);
      return res.status(502).json({ reply: "Deu pane nessa joça por culpa de vocês! Tenta de novo, seu lesado." });
    }

    const dados = await respostaGroq.json();
    const resposta =
      dados?.choices?.[0]?.message?.content?.trim() ||
      "Escreveu tanta merda que o cérebro do bot derreteu. Tenta de novo.";

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({ reply: "Deu pau geral aqui nessa merda de servidor. Culpa tua." });
  }
}
