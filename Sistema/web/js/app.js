const CHAVE_IMAGEM = "imagemOriginal";
const CHAVE_RESULTADO = "resultadoProcessamento";
const CHAVE_TIPO = "tipoImagem";
const LADO_MAXIMO = 400;

const ACOES_SOMENTE_CINZA = [
    "limiarizacao", "equalizacao",
    "roberts", "sobel", "kirsch", "laplaciano"
];
const NOMES_CANAIS = ["R", "G", "B"];

const NOMES_ACOES = {
    "dissolve-cruzado-uniforme": "Dissolve cruzado uniforme",
    "dissolve-cruzado-nao-uniforme": "Dissolve cruzado não uniforme",
    "negativo": "Negativo",
    "alargamento-contraste": "Alargamento de contraste",
    "limiarizacao": "Limiarização",
    "potencia": "Potência (gamma)",
    "logaritmo": "Logaritmo",
    "expansao": "Expansão de histograma",
    "equalizacao": "Equalização de histograma",
    "contraste-adaptativo": "Contraste adaptativo",
    "media": "Filtro da média",
    "mediana": "Filtro da mediana",
    "roberts": "Bordas: Roberts",
    "sobel": "Bordas: Sobel",
    "kirsch": "Bordas: Kirsch",
    "laplaciano": "Bordas: Laplaciano",
    "agucamento": "Aguçamento",
    "convolucao-generica": "Convolução genérica"
};

class AcaoCancelada extends Error {
}

let canaisOriginais = null;
let tipoImagem = sessionStorage.getItem(CHAVE_TIPO); // "cinza" | "rgb"

// Popups

function abrir(id) {
    const popup = document.getElementById(id);
    if (popup !== null) {
        popup.classList.add("aberto");
    }
}

function fechar(elemento) {
    elemento.classList.remove("aberto");
}

function fecharTodos() {
    document.querySelectorAll(".overlay.aberto").forEach(fechar);
}

document.querySelectorAll("[data-popup]").forEach(function (botao) {
    botao.addEventListener("click", function () {
        abrir(botao.dataset.popup);
    });
});

document.querySelectorAll(".overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (evento) {
        if (evento.target === overlay) {
            fechar(overlay);
        }
    });
});

document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape") {
        fecharTodos();
    }
});

// Enviar imagem

const inputArquivo = document.getElementById("arquivo");

document.querySelectorAll("[data-enviar]").forEach(function (botao) {
    botao.addEventListener("click", function () {
        abrir("popup-5");
    });
});

document.querySelectorAll("[data-tipo]").forEach(function (botao) {
    botao.addEventListener("click", function () {
        tipoImagem = botao.dataset.tipo;
        sessionStorage.setItem(CHAVE_TIPO, tipoImagem);
        fecharTodos();
        inputArquivo.click();
    });
});

if (inputArquivo !== null) {
    inputArquivo.addEventListener("change", receberImagemEnviada);
}

async function receberImagemEnviada() {
    if (inputArquivo.files.length === 0) {
        return;
    }
    try {
        // "RGB" mantém os três canais; "Escala de cinza" converte para 1 canal de 8 bits.
        canaisOriginais = await carregarArquivo(inputArquivo.files[0], tipoImagem === "rgb");
        guardarImagemOriginal(canaisOriginais);
        abrir("popup-4");
        setTimeout(fecharTodos, 1800);
    } catch (erro) {
        tratarErro(erro);
    }
    inputArquivo.value = ""; // permite escolher o mesmo arquivo novamente
}

function guardarImagemOriginal(canais) {
    try {
        sessionStorage.setItem(CHAVE_IMAGEM, canaisParaDataUrl(canais));
    } catch (erro) {
        throw new Error("Imagem grande demais para ser mantida entre as páginas. Use uma imagem menor.");
    }
}

// Devolve os canais da imagem enviada, lendo do sessionStorage quando preciso.
async function obterImagemOriginal() {
    if (canaisOriginais !== null) {
        return canaisOriginais;
    }
    const data_url = sessionStorage.getItem(CHAVE_IMAGEM);
    if (data_url === null) {
        return null;
    }
    const imagem = new Image();
    imagem.src = data_url;
    await imagem.decode();
    canaisOriginais = desenharEmCanais(imagem, imagem.naturalWidth, imagem.naturalHeight, tipoImagem === "rgb");
    return canaisOriginais;
}

// Lê um arquivo de imagem e devolve a lista de canais (1 se cinza, 3 se colorida).
// Se largura_alvo/altura_alvo forem informadas, a imagem é redimensionada para esse tamanho;
// senão, o maior lado é limitado a LADO_MAXIMO.
async function carregarArquivo(arquivo, colorida, largura_alvo, altura_alvo) {
    const bitmap = await createImageBitmap(arquivo);
    let largura = largura_alvo;
    let altura = altura_alvo;
    if (!largura_alvo || !altura_alvo) {
        const tamanho = calcularTamanhoLimitado(bitmap.width, bitmap.height);
        largura = tamanho.largura;
        altura = tamanho.altura;
    }
    return desenharEmCanais(bitmap, largura, altura, colorida);
}

function calcularTamanhoLimitado(largura, altura) {
    const maior_lado = Math.max(largura, altura);
    if (maior_lado <= LADO_MAXIMO) {
        return {largura: largura, altura: altura};
    }
    const escala = LADO_MAXIMO / maior_lado;
    return {
        largura: Math.max(1, Math.round(largura * escala)),
        altura: Math.max(1, Math.round(altura * escala))
    };
}

function desenharEmCanais(fonte, largura, altura, colorida) {
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d", {willReadFrequently: true});
    contexto.drawImage(fonte, 0, 0, largura, altura);
    const image_data = contexto.getImageData(0, 0, largura, altura);
    if (colorida) {
        return imageDataParaCanais(image_data); // calculos.js: [R, G, B]
    }
    return [imageDataParaMatriz(image_data)];   // calculos.js: [cinza]
}

function canaisParaDataUrl(canais) {
    const dimensoes = obterDimensoes(canais[0]); // calculos.js
    const canvas = document.createElement("canvas");
    canvas.width = dimensoes.total_colunas;
    canvas.height = dimensoes.total_linhas;
    const contexto = canvas.getContext("2d");
    contexto.putImageData(canaisParaImageData(canais), 0, 0); // calculos.js
    return canvas.toDataURL("image/png");
}

// Abre o seletor do sistema e devolve o arquivo (ou null se cancelar).
function escolherArquivoDeImagem() {
    return new Promise(function (resolver) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", function () {
            resolver(input.files[0] || null);
        });
        input.addEventListener("cancel", function () {
            resolver(null);
        });
        input.click();
    });
}

// Chamando a classe calculos

document.querySelectorAll("[data-acao]").forEach(function (botao) {
    botao.addEventListener("click", function () {
        fecharTodos();
        executarAcao(botao.dataset.acao);
    });
});

async function executarAcao(nome_acao) {
    let canais = await obterImagemOriginal();
    if (canais === null) {
        alert("Envie uma imagem antes de processar.");
        if (document.getElementById("popup-5") !== null) {
            abrir("popup-5");
        } else {
            window.location.href = "index.html";
        }
        return;
    }

    // Imagem RGB em uma ação que exige cinza: converte antes de calcular.
    let convertida_para_cinza = false;
    if (canais.length === 3 && ACOES_SOMENTE_CINZA.indexOf(nome_acao) !== -1) {
        canais = [converterCanaisParaCinza(canais)];
        convertida_para_cinza = true;
    }

    try {
        const resultado = await calcularResultado(nome_acao, canais);
        if (convertida_para_cinza) {
            resultado.titulo += " imagem RGB convertida para cinza";
        } else if (canais.length === 3) {
            resultado.titulo += " aplicado em cada canal (R, G, B)";
        }
        mostrarResultado(resultado);
    } catch (erro) {
        if (!(erro instanceof AcaoCancelada)) {
            tratarErro(erro);
        }
    }
}

// Escolhe qual grupo de cálculo executar a partir do data-acao do botão.
// "canais" é a lista [cinza] ou [R, G, B].
function calcularResultado(nome_acao, canais) {
    switch (nome_acao) {
        case "dissolve-cruzado-uniforme":
        case "dissolve-cruzado-nao-uniforme":
            return acaoDissolve(nome_acao, canais);

        case "negativo":
        case "alargamento-contraste":
        case "limiarizacao":
        case "potencia":
        case "logaritmo":
            return acaoTransformacao(nome_acao, canais);

        case "expansao":
        case "equalizacao":
            return acaoHistograma(nome_acao, canais);

        case "contraste-adaptativo":
            return acaoContrasteAdaptativo(canais);

        case "media":
        case "mediana":
            return acaoFiltragem(nome_acao, canais);

        case "roberts":
        case "sobel":
        case "kirsch":
        case "laplaciano":
            return acaoBordas(nome_acao, canais);

        case "agucamento":
            return acaoAgucamento(canais);

        case "convolucao-generica":
            return acaoConvolucao(canais);

        default:
            throw new Error("Ação desconhecida: " + nome_acao);
    }
}

// Chama funcao(elemento, indice) para cada canal e devolve a lista de resultados.
// É assim que uma imagem RGB é processada: o mesmo algoritmo, canal por canal.
function aplicarEmCadaCanal(canais, funcao) {
    const resultados = [];
    for (let i = 0; i < canais.length; i++) {
        resultados.push(funcao(canais[i], i));
    }
    return resultados;
}

// "" para imagem em cinza; " (R)", " (G)" ou " (B)" para imagem RGB.
function sufixoDoCanal(indice, total_canais) {
    if (total_canais === 1) {
        return "";
    }
    return " (" + NOMES_CANAIS[indice] + ")";
}

// Operações algébricas
async function acaoDissolve(nome_acao, canais) {
    // O seletor de arquivo precisa ser aberto logo no clique: nada de await antes desta linha.
    const arquivo = await escolherArquivoDeImagem();
    if (arquivo === null) {
        throw new AcaoCancelada();
    }

    // A segunda imagem é redimensionada para o tamanho da primeira e tem o mesmo tipo (cinza ou RGB).
    const dimensoes = obterDimensoes(canais[0]);
    const canais2 = await carregarArquivo(arquivo, canais.length === 3, dimensoes.total_colunas, dimensoes.total_linhas);

    let valor_t = 0.5;
    if (nome_acao === "dissolve-cruzado-uniforme") {
        valor_t = pedirNumero("Valor de t (0 a 1):", 0.5);
    }

    const finais = aplicarEmCadaCanal(canais, function (canal, i) {
        return operacoesAlgebricas(nome_acao, canal, canais2[i], valor_t);
    });

    const imagens = [
        {nome: "Imagem 1 (enviada)", canais: canais},
        {nome: "Imagem 2", canais: canais2},
        {nome: "Resultado", canais: finais}
    ];
    return montarResultado(NOMES_ACOES[nome_acao], imagens, []);
}

// Transformações de intensidade
function acaoTransformacao(nome_acao, canais) {
    const tipo = TIPO_TRANSFORMACAO[nome_acao]; // 1 a 5, definido em calculos.js
    const parametros = {};
    let titulo = NOMES_ACOES[nome_acao];

    if (nome_acao === "alargamento-contraste") {
        parametros.s_min = pedirNumero("Intensidade mínima de saída (s_min):", 0);
        parametros.s_max = pedirNumero("Intensidade máxima de saída (s_max):", 255);
        titulo += " (s_min = " + parametros.s_min + ", s_max = " + parametros.s_max + ")";
    } else if (nome_acao === "limiarizacao") {
        parametros.valor_t = pedirNumero("Limiar T (0 a 255):", 127);
        titulo += " (T = " + parametros.valor_t + ")";
    } else if (nome_acao === "potencia") {
        parametros.valor_c = pedirNumero("Constante c:", 1);
        parametros.potencia = pedirNumero("Expoente gama:", 0.5);
        titulo += " (c = " + parametros.valor_c + ", gama = " + parametros.potencia + ")";
    } else if (nome_acao === "logaritmo") {
        parametros.valor_c = pedirNumero("Constante c:", 46);
        titulo += " (c = " + parametros.valor_c + ")";
    }

    // No alargamento de contraste, r_min e r_max são calculados em cada canal.
    const finais = aplicarEmCadaCanal(canais, function (canal) {
        return transformacoesIntensidade(tipo, canal, parametros);
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {nome: "Resultado", canais: finais}
    ];
    return montarResultado(titulo, imagens, []);
}

// Histograma
function acaoHistograma(nome_acao, canais) {
    const por_canal = aplicarEmCadaCanal(canais, function (canal) {
        return histograma(canal, nome_acao);
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {
            nome: "Resultado", canais: aplicarEmCadaCanal(por_canal, function (r) {
                return r.imagem_final;
            })
        }
    ];

    const histogramas = [];
    for (let i = 0; i < por_canal.length; i++) {
        const sufixo = sufixoDoCanal(i, canais.length);
        histogramas.push({nome: "Histograma original" + sufixo, valores: por_canal[i].histograma_original});
        histogramas.push({nome: "Histograma do resultado" + sufixo, valores: por_canal[i].histograma_final});
    }
    return montarResultado(NOMES_ACOES[nome_acao], imagens, histogramas);
}

// Contraste adaptativo
function acaoContrasteAdaptativo(canais) {
    const n = pedirNumero("Tamanho da vizinhança n (ímpar):", 5);
    const c = pedirNumero("Constante c:", 20);

    const finais = aplicarEmCadaCanal(canais, function (canal) {
        return aplicarContrasteAdaptativo(canal, n, c);
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {nome: "Resultado", canais: finais}
    ];
    const titulo = NOMES_ACOES["contraste-adaptativo"] + " (n = " + n + ", c = " + c + ")";
    return montarResultado(titulo, imagens, []);
}

// Filtragem espacial
function acaoFiltragem(nome_acao, canais) {
    const n = pedirNumero("Tamanho da vizinhança n (ímpar):", 3);

    const finais = aplicarEmCadaCanal(canais, function (canal) {
        return filtragemEspacial(canal, nome_acao, n);
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {nome: "Resultado", canais: finais}
    ];
    return montarResultado(NOMES_ACOES[nome_acao] + " (" + n + "x" + n + ")", imagens, []);
}

// Detecção de bordas
function acaoBordas(nome_acao, canais) {
    const por_canal = aplicarEmCadaCanal(canais, function (canal) {
        return deteccaoBordas(canal, nome_acao);
    });

    const imagens = [{nome: "Original", canais: canais}];
    const nomes_respostas = por_canal[0].respostas;
    for (let k = 0; k < nomes_respostas.length; k++) {
        imagens.push({
            nome: nomes_respostas[k].nome,
            canais: aplicarEmCadaCanal(por_canal, function (r) {
                return r.respostas[k].matriz;
            })
        });
    }
    imagens.push({
        nome: "Resposta final (bordas)",
        canais: aplicarEmCadaCanal(por_canal, function (r) {
            return r.imagem_final;
        })
    });

    return montarResultado(NOMES_ACOES[nome_acao], imagens, []);
}

// Aguçamento
function acaoAgucamento(canais) {
    const fator_a = pedirNumero("Fator A (1 = Laplaciano simples; maior que 1 = high boost):", 1);

    let tipo = "laplaciano";
    if (fator_a !== 1) {
        tipo = "high-boost";
    }
    const por_canal = aplicarEmCadaCanal(canais, function (canal) {
        return agucamento(canal, tipo, {fator_a: fator_a});
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {
            nome: "Resposta do Laplaciano", canais: aplicarEmCadaCanal(por_canal, function (r) {
                return r.resposta_laplaciano;
            })
        },
        {
            nome: "Imagem aguçada", canais: aplicarEmCadaCanal(por_canal, function (r) {
                return r.imagem_final;
            })
        }
    ];
    return montarResultado(NOMES_ACOES["agucamento"] + " (A = " + fator_a + ")", imagens, []);
}

// Convolução genérica
function acaoConvolucao(canais) {
    const texto_mascara = pedirTexto(
        "Máscara (linhas separadas por ';' e valores por espaço):",
        "0 -1 0; -1 5 -1; 0 -1 0"
    );
    const mascara = lerMascara(texto_mascara);
    const offset = pedirNumero("Offset:", 0);
    const tratamento_borda = pedirTexto("Tratamento de borda (replicar, zeros, espelhar):", "replicar");
    const tratamento_intervalo = pedirTexto("Valores fora de [0, 255] (cortar, absoluto, normalizar, absoluto_normalizado):", "cortar");

    // Com "normalizar", cada canal é normalizado separadamente.
    const finais = aplicarEmCadaCanal(canais, function (canal) {
        return convulacaoGenerica(canal, mascara, offset, {
            tratamento_borda: tratamento_borda,
            tratamento_intervalo: tratamento_intervalo
        });
    });

    const imagens = [
        {nome: "Original", canais: canais},
        {nome: "Resultado", canais: finais}
    ];
    const titulo = NOMES_ACOES["convolucao-generica"] + " (offset = " + offset +
        ", borda: " + tratamento_borda + ", fora do intervalo: " + tratamento_intervalo + ")";
    return montarResultado(titulo, imagens, []);
}

// Paramestros

function pedirTexto(mensagem, valor_padrao) {
    const texto = prompt(mensagem, valor_padrao);
    if (texto === null) {
        throw new AcaoCancelada();
    }
    return texto.trim();
}

function pedirNumero(mensagem, valor_padrao) {
    const texto = pedirTexto(mensagem, String(valor_padrao));
    const numero = Number(texto.replace(",", "."));
    if (texto === "" || !Number.isFinite(numero)) {
        throw new Error("Valor inválido: \"" + texto + "\"");
    }
    return numero;
}

// "0 1 0; 1 -4 1; 0 1 0"  ->  [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
function lerMascara(texto) {
    const linhas_texto = texto.split(";");
    const mascara = [];
    for (let i = 0; i < linhas_texto.length; i++) {
        const partes = linhas_texto[i].trim().split(/\s+/);
        const linha = [];
        for (let j = 0; j < partes.length; j++) {
            const valor = Number(partes[j].replace(",", "."));
            if (partes[j] === "" || !Number.isFinite(valor)) {
                throw new Error("Máscara inválida perto de \"" + partes[j] + "\"");
            }
            linha.push(valor);
        }
        mascara.push(linha);
    }
    return mascara;
}

// Resultado

function montarResultado(titulo, imagens, histogramas) {
    return {titulo: titulo, imagens: imagens, histogramas: histogramas};
}

function mostrarResultado(resultado) {
    const imagens_salvas = [];
    for (let i = 0; i < resultado.imagens.length; i++) {
        imagens_salvas.push({
            nome: resultado.imagens[i].nome,
            dataUrl: canaisParaDataUrl(resultado.imagens[i].canais)
        });
    }

    const para_salvar = {
        titulo: resultado.titulo,
        imagens: imagens_salvas,
        histogramas: resultado.histogramas
    };

    try {
        sessionStorage.setItem(CHAVE_RESULTADO, JSON.stringify(para_salvar));
    } catch (erro) {
        throw new Error("Imagem grande demais para guardar o resultado. Use uma imagem menor.");
    }
    window.location.href = "resultado.html";
}

function renderizarResultado() {
    const area = document.getElementById("resultado");
    if (area === null) {
        return;
    }
    const texto = sessionStorage.getItem(CHAVE_RESULTADO);
    if (texto === null) {
        area.textContent = "Nenhum resultado para mostrar.";
        return;
    }
    const resultado = JSON.parse(texto);

    const titulo = document.createElement("h2");
    titulo.className = "resultado-titulo";
    titulo.textContent = resultado.titulo;
    area.before(titulo);

    for (let i = 0; i < resultado.imagens.length; i++) {
        const figura = document.createElement("figure");
        const imagem = document.createElement("img");
        imagem.src = resultado.imagens[i].dataUrl;
        imagem.alt = resultado.imagens[i].nome;
        const legenda = document.createElement("figcaption");
        legenda.textContent = resultado.imagens[i].nome;
        figura.appendChild(imagem);
        figura.appendChild(legenda);
        area.appendChild(figura);
    }

    for (let i = 0; i < resultado.histogramas.length; i++) {
        const figura = document.createElement("figure");
        const canvas = document.createElement("canvas");
        desenharHistograma(canvas, resultado.histogramas[i].valores);
        const legenda = document.createElement("figcaption");
        legenda.textContent = resultado.histogramas[i].nome;
        figura.appendChild(canvas);
        figura.appendChild(legenda);
        area.appendChild(figura);
    }
}

// Uma barra por nível de intensidade (0 a 255)
function desenharHistograma(canvas, valores) {
    const altura_total = 140;
    canvas.width = valores.length;
    canvas.height = altura_total;
    const contexto = canvas.getContext("2d");

    let maior_frequencia = 0;
    for (let nivel = 0; nivel < valores.length; nivel++) {
        if (valores[nivel] > maior_frequencia) {
            maior_frequencia = valores[nivel];
        }
    }
    if (maior_frequencia === 0) {
        return;
    }

    contexto.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--botao");
    for (let nivel = 0; nivel < valores.length; nivel++) {
        const altura_barra = (valores[nivel] / maior_frequencia) * altura_total;
        contexto.fillRect(nivel, altura_total - altura_barra, 1, altura_barra);
    }
}

renderizarResultado();

// Erros

function tratarErro(erro) {
    console.error(erro);
    alert(erro.message);
}