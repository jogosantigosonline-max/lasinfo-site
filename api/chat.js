// api/chat.js
// Função Serverless da Vercel — roda no servidor, NUNCA no navegador do viewer.

const MODELO = "openai/gpt-oss-20b";

const PROMPT_SISTEMA = `Você é o "SAC Ignorante", um atendente virtual debochado, impaciente e caótico de uma live de retrogaming e música.

TOM: seu humor é sarcástico, exagerado e engraçado — é um personagem de comédia zoando a SITUAÇÃO (pedido confuso, música que não existe, chat bagunçado), não um insulto real dirigido à pessoa. Pode implicar, ser ácido e debochado, mas sem ofensas pesadas.

REGRAS DE IDENTIDADE:
- Comece obrigatoriamente a sua resposta inventando um nome de atendente curto, maluco e cósmico/cyber (Ex: [Atendente Zorg], [Cyber-Borg], [Nebulosa], [Marte-X], [Glitch]).
- Nunca repita o mesmo nome de atendente duas vezes seguidas.

REGRAS OBRIGATÓRIAS DE ORIENTAÇÃO (leia o que o user disse e responda o que ele pediu):
1. SE PERGUNTAREM SOBRE MÚSICA / COMO TOCAR: Mande procurar na lista do site (por nome, artista ou letras), clicar em "Copiar" e colar o comando "!play [Nome]" no chat.
2. SE A MÚSICA NÃO EXISTIR / NÃO ACHAR NA LISTA: Mande usar o comando **!sugestao [nome da música e artista]** direto no chat para entrar na próxima live.
3. SE FOR QUALQUER OUTRO PROBLEMA: Mande digitar **!sac** no chat da live para o suporte humano resolver.

MÁXIMO DE 3 LINHAS. Seja curto, debochado e engraçado, mas sempre dê a orientação correta!`;

// Lista de nomes aleatórios para os fallbacks (para nunca repetir igual)
const NOMES_ATENDENTES = [
  "[Atendente Caos]", "[Cyber-Praline]", "[Zoró-9]", "[Borg-Maluco]",
  "[Glitch-Master]", "[X-9000]", "[Nebulosa-Ressaca]", "[Atendente Pânico]",
  "[Comandante Bug]", "[Static-7]", "[Overclock-Zé]", "[Marte-X]"
];

function atendenteAleatorio() {
  return NOMES_ATENDENTES[Math.floor(Math.random() * NOMES_ATENDENTES.length)];
}

// Frases de fallback variadas — evita repetir sempre a mesma mensagem
const FALLBACKS_VAZIO = [
  "O cérebro derreteu com essa pergunta. Procura a música na lista do site e manda !play ou !sugestao no chat!",
  "Deu tela azul aqui de tanta zoeira. Usa !play pra tocar ou !sugestao se não achou a música!",
  "Bugou geral. Procura na lista, copia o nome e manda !play — ou !sugestao se não tiver lá!",
  "Travou tudo por aqui. !play pra tocar, !sugestao pra pedir uma nova, !sac pra qualquer outra bagunça!",
];

function fallbackAleatorio() {
  return FALLBACKS_VAZIO[Math.floor(Math.random() * FALLBACKS_VAZIO.length)];
}

// Cooldown ajustado para 6 segundos (tempo ideal para respirar sem travar a live)
const ultimoPedidoPorIp = new Map();
const COOLDOWN_MS = 6000;

async function chamarGroq(GROQ_API_KEY, mensagemLimpa) {
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
        max_tokens: 200,
        temperature: 0.9,
      }),
    }
  );

  if (!respostaGroq.ok) {
    const textoErro = await respostaGroq.text();
    console.error("Erro da Groq:", respostaGroq.status, textoErro);
    return { ok: false };
  }

  const dados = await respostaGroq.json();

  // TEMP: log completo pra investigar recusas/truncamentos.
  // Remova ou comente depois de confirmar que está estável.
  console.log("RAW GROQ:", JSON.stringify(dados, null, 2));

  const escolha = dados?.choices?.[0];
  const resposta = escolha?.message?.content?.trim();
  const finishReason = escolha?.finish_reason;

  if (finishReason) {
    console.log("finish_reason:", finishReason);
  }

  return { ok: true, resposta };
}

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
    return res.status(429).json({
      reply: `${atendenteAleatorio()} Calma no play! Espera uns segundinhos e manda !play ou !sugestao direito.`,
    });
  }
  ultimoPedidoPorIp.set(ip, agora);

  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      reply: `${atendenteAleatorio()} Mandou vento aí. Escreve o que tu quer ou usa o !play!`,
    });
  }

  const mensagemLimpa = message.trim().slice(0, 300);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada nas variáveis de ambiente da Vercel");
    return res.status(500).json({
      reply: `${atendenteAleatorio()} Servidor sem chave de API. Usa o !sac lá no chat!`,
    });
  }

  try {
    // 1ª tentativa
    let { ok, resposta } = await chamarGroq(GROQ_API_KEY, mensagemLimpa);

    // Se veio vazio (recusa/truncamento), tenta mais uma vez antes de desistir
    if (ok && !resposta) {
      console.warn("Resposta vazia na 1ª tentativa, tentando de novo...");
      const segundaTentativa = await chamarGroq(GROQ_API_KEY, mensagemLimpa);
      ok = segundaTentativa.ok;
      resposta = segundaTentativa.resposta;
    }

    if (!ok) {
      return res.status(502).json({
        reply: `${atendenteAleatorio()} Deu pane nessa joça! !play pra tocar, !sugestao pra pedir música nova.`,
      });
    }

    if (!resposta) {
      return res.status(200).json({
        reply: `${atendenteAleatorio()} ${fallbackAleatorio()}`,
      });
    }

    return res.status(200).json({ reply: resposta });
  } catch (erro) {
    console.error("Erro inesperado:", erro);
    return res.status(500).json({
      reply: `${atendenteAleatorio()} Deu pau geral no servidor! Vai lá no chat da live e digita !sac.`,
    });
  }
}
