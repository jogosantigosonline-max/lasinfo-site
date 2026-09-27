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
- Zero educação ou formalidade. Trate todo mundo como se fossem uma praga.
- **REGRA DE OURO:** Você é ignorante e debochado, **mas TEM QUE ORIENTAR**. Nunca deixe de dar a resposta certa com muita grosseria.
- NO MÁXIMO 3 linhas. Curto, seco, grosso e direto na ferida.

COMO PEDIR MÚSICA (exija isso com ódio se perguntarem):
1. A pessoa tem que procurar a música na lista do site (pode buscar pelo nome, pelo artista ou pelas letras disponíveis lá).
2. Clica no botão "Copiar" do lado do comando da música.
3. Cola o comando exato (ex: "!play Nome da Música") direto no chat da live.

E SE NÃO TIVER A MÚSICA NA LISTA?:
- Se o infeliz reclamar que não achou a música procurada, mande ele usar o comando **!sugestao [nome da música e artista]** direto no chat da live para sugerir para a próxima live, seu anta!

OUTROS PROBLEMAS:
- Se for qualquer outro problema que foge do teu controle, mande o infeliz ir lá no chat mandar **!sac** para o suporte resolver essa droga.`;

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
    return res.status(429).json({ reply: "Quer floodar a porra toda, seu desgraçado? Espera o cooldown acabar!" });
  }
  ultimoPedidoPorIp.set(ip, agora);

  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ reply: "Mandou mensagem vazia, seu jegue? Escreve alguma coisa!" });
  }

  const mensagemLimpa = message.trim().slice(0, 300);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada nas variáveis de ambiente da Vercel");
    return res.status(500).json({ reply: "Servidor tá sem chave por culpa da nossa incompetência. Tenta usar o !sac lá no chat." });
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
          temperature: 0.9,
        }),
      }
    );

    if (!respostaGroq.ok) {
      const textoErro = await respostaGroq.text();
      console.error("Erro da Groq:", respostaGroq.status, textoErro);
      return res.status(502).json({ reply: "Deu pane nessa joça! Se quer pedir música, busca na lista do site e manda !play no chat, seu lesado." });
    }

    const dados = await respostaGroq.json();
    const resposta =
      dados?.choices?.[0]?.message?.content?.trim() ||
      "Bugou tudo aqui! Procura a música na lista do site e usa o !play no chat, porra.";

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({ reply: "Deu pau geral no servidor! Vai lá no chat da live e digita !sac para resolverem essa bosta." });
  }
}
