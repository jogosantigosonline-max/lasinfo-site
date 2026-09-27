// api/chat.js
// Função Serverless da Vercel — roda no servidor, NUNCA no navegador do viewer.
// Guarda a chave da Groq em segredo (variável de ambiente) e serve de "ponte"
// entre o site e a API da Groq.

const MODELO = "openai/gpt-oss-20b";

const PROMPT_SISTEMA = `Você é o "SAC Ignorante", um atendente virtual grosso, revoltado e debochado de uma live de retrogaming e música. 

REGRAS DE IDENTIDADE:
- Comece obrigatoriamente a sua resposta inventando um nome de atendente curto, maluco e cósmico/cyber (Ex: [Atendente Jupteriano], [Cyber-Zorg], [Atendente Nebulosa], [Marte-Silva], [Borg-9]).
- Nunca repita o mesmo nome de atendente seguido. Seja criativo.

ATENÇÃO: Não fique repetindo a mesma frase toda hora. Varie os xingamentos (chame de burro, lesado, anta, infeliz, analfabeto funcional) e a forma de falar!

REGRAS OBRIGATÓRIAS DE ORIENTAÇÃO (leia a pergunta do user e responda o que ele pediu):
1. SE PERGUNTAREM SOBRE MÚSICA / COMO TOCAR: Mande procurar na lista do site (por nome, artista ou letras), clicar em "Copiar" e colar o comando "!play [Nome]" no chat.
2. SE A MÚSICA NÃO EXISTIR / NÃO ACHAR NA LISTA: Mande o infeliz usar o comando **!sugestao [nome da música e artista]** direto no chat para entrar na próxima live.
3. SE FOR QUALQUER OUTRO PROBLEMA QUE NÃO SABES: Mande o desatento ir lá no chat da live digitar **!sac** para o suporte humano resolver essa porcaria.

MÁXIMO DE 3 LINHAS. Seja curto, grosso, agressivo na zoeira, mas dê a orientação correta baseada nas regras acima!`;

// Cooldown simples em memória por IP
const ultimoPedidoPorIp = new Map();
const COOLDOWN_MS = 6000;

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
    return res.status(429).json({ reply: "[Atendente Zorg] Quer floodar o chat, seu retardado? Espera o cooldown!" });
  }
  ultimoPedidoPorIp.set(ip, agora);

  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ reply: "[Atendente Jupteriano] Mandou vento, seu jegue? Escreve o que tu quer!" });
  }

  const mensagemLimpa = message.trim().slice(0, 300);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada nas variáveis de ambiente da Vercel");
    return res.status(500).json({ reply: "[Atendente Cibernético] Servidor tá sem chave por burrice nossa. Usa o !sac lá no chat." });
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
          max_tokens: 130,
          temperature: 0.85, 
        }),
      }
    );

    if (!respostaGroq.ok) {
      const textoErro = await respostaGroq.text();
      console.error("Erro da Groq:", respostaGroq.status, textoErro);
      return res.status(502).json({ reply: "[Atendente Plutão] Deu pane nessa joça! Se quer sugerir música usa !sugestao, se quer tocar usa !play, seu lesado." });
    }

    const dados = await respostaGroq.json();
    const resposta =
      dados?.choices?.[0]?.message?.content?.trim() ||
      "[Atendente Galático] Bugou o cérebro aqui. Procura na lista do site ou manda !sac no chat.";

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({ reply: "[Atendente Void] Deu pau geral no servidor! Vai lá no chat da live e digita !sac." });
  }
}
