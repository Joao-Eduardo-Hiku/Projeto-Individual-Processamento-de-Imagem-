const limite_L_final = 255;

const TIPO_TRANSFORMACAO = {
    "negativo": 1,
    "alargamento-contraste": 2,
    "limiarizacao": 3,
    "potencia": 4,
    "logaritmo": 5
};

const MASCARA_LAPLACIANO = [
    [0, 1, 0],
    [1, -4, 1],
    [0, 1, 0]
];
const MASCARA_SOBEL_GX = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1]
];
const MASCARA_SOBEL_GY = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
];
// Roberts é 2x2 (Gx = z9 - z5, Gy = z8 - z6). Aqui foi colocado dentro de
// uma máscara 3x3 com o pixel atual no centro, para reaproveitar a convolução.
const MASCARA_ROBERTS_GX = [
    [0, 0, 0],
    [0, -1, 0],
    [0, 0, 1]
];
const MASCARA_ROBERTS_GY = [
    [0, 0, 0],
    [0, 0, -1],
    [0, 1, 0]
];
const NOMES_DIRECOES_KIRSCH = [
    "Norte", "Nordeste", "Leste", "Sudeste",
    "Sul", "Sudoeste", "Oeste", "Noroeste"
];

function validarImagem(imagem) {
    if (!Array.isArray(imagem) || imagem.length === 0 ||
        !Array.isArray(imagem[0]) || imagem[0].length === 0) {
        throw new Error("Imagem inválida: era esperada uma matriz não vazia.");
    }
    const total_colunas = imagem[0].length;
    for (let linha = 1; linha < imagem.length; linha++) {
        if (imagem[linha].length !== total_colunas) {
            throw new Error("Imagem inválida: linhas com tamanhos diferentes.");
        }
    }
}

function obterDimensoes(imagem) {
    const total_linhas = imagem.length;
    const total_colunas = imagem[0].length;
    return {total_linhas, total_colunas};
}

function criarMatriz(total_linhas, total_colunas, valor_inicial) {
    const matriz = [];
    for (let linha = 0; linha < total_linhas; linha++) {
        const nova_linha = [];
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            nova_linha.push(valor_inicial);
        }
        matriz.push(nova_linha);
    }
    return matriz;
}

function copiarMatriz(imagem) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const copia = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            copia[linha][coluna] = imagem[linha][coluna];
        }
    }
    return copia;
}

// Arredonda e limita o valor ao intervalo [0, 255] (inteiro de 8 bits).
function limitarPixel(valor) {
    const valor_arredondado = Math.round(valor);
    if (valor_arredondado > limite_L_final) {
        return limite_L_final;
    }
    if (valor_arredondado < 0) {
        return 0;
    }
    return valor_arredondado;
}

function encontrarMinimoMaximo(matriz) {
    const {total_linhas, total_colunas} = obterDimensoes(matriz);
    let valor_minimo = matriz[0][0];
    let valor_maximo = matriz[0][0];
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const valor = matriz[linha][coluna];
            if (valor < valor_minimo) {
                valor_minimo = valor;
            }
            if (valor > valor_maximo) {
                valor_maximo = valor;
            }
        }
    }
    return {valor_minimo, valor_maximo};
}

function exigirParametro(parametros, nome) {
    if (typeof parametros[nome] !== "number" || !Number.isFinite(parametros[nome])) {
        throw new Error("Parâmetro obrigatório ausente ou inválido: " + nome);
    }
}

// A vizinhança n x n precisa ser ímpar para existir um pixel central.
function validarTamanhoVizinhanca(n) {
    if (!Number.isInteger(n) || n < 1 || n % 2 === 0) {
        throw new Error("O tamanho da vizinhança deve ser um inteiro ímpar (1, 3, 5, ...).");
    }
}

// Array.sort() do JavaScript ordena como TEXTO ("100" < "20"); por isso
// a comparação numérica precisa ser informada.
function compararNumeros(a, b) {
    return a - b;
}

function calcularMediaDosValores(valores) {
    let soma = 0;
    for (let i = 0; i < valores.length; i++) {
        soma += valores[i];
    }
    return soma / valores.length;
}

function extrairVizinhanca(imagem, x, y, n) {
    const deslocamento = Math.floor(n / 2);
    const vizinhanca = [];
    for (let i = x - deslocamento; i <= x + deslocamento; i++) {
        for (let j = y - deslocamento; j <= y + deslocamento; j++) {
            if (i >= 0 && i < imagem.length && j >= 0 && j < imagem[0].length) {
                vizinhanca.push(imagem[i][j]);
            }
        }
    }
    return vizinhanca;
}

// Transformação ponto a ponto: s = T(r), com o resultado limitado a [0, 255].
// "funcaoTransformacao" recebe (r, parametros) e devolve s.
function aplicarTransformacaoPontual(imagem, funcaoTransformacao, parametros) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const imagem_final = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const r = imagem[linha][coluna];
            const s = funcaoTransformacao(r, parametros);
            imagem_final[linha][coluna] = limitarPixel(s);
        }
    }
    return imagem_final;
}

//    tipo: "dissolve-cruzado-uniforme" | "dissolve-cruzado-nao-uniforme"

function operacoesAlgebricas(tipo, imagem1, imagem2, valor_t = 0.5) {
    validarImagem(imagem1);
    validarImagem(imagem2);

    const dimensoes1 = obterDimensoes(imagem1);
    const dimensoes2 = obterDimensoes(imagem2);
    if (dimensoes1.total_linhas !== dimensoes2.total_linhas ||
        dimensoes1.total_colunas !== dimensoes2.total_colunas) {
        throw new Error("As duas imagens precisam ter o mesmo tamanho.");
    }
    const total_linhas = dimensoes1.total_linhas;
    const total_colunas = dimensoes1.total_colunas;

    let matriz_t;
    if (tipo === "dissolve-cruzado-uniforme") {
        // t é o mesmo em todos os pixels
        if (valor_t < 0 || valor_t > 1) {
            throw new Error("O valor de t deve estar entre 0 e 1.");
        }
        matriz_t = criarMatriz(total_linhas, total_colunas, valor_t);
    } else if (tipo === "dissolve-cruzado-nao-uniforme") {
        // t varia com a coluna: 0 na primeira (só imagem1) até 1 na última (só imagem2)
        matriz_t = criarMatrizTNaoUniforme(total_linhas, total_colunas);
    } else {
        throw new Error("Tipo de dissolve inválido: " + tipo);
    }

    return misturarImagens(imagem1, imagem2, matriz_t);
}

function criarMatrizTNaoUniforme(total_linhas, total_colunas) {
    const matriz_t = criarMatriz(total_linhas, total_colunas, 0);
    for (let coluna = 0; coluna < total_colunas; coluna++) {
        let t_da_coluna = 0;
        if (total_colunas > 1) {
            t_da_coluna = coluna / (total_colunas - 1);
        }
        for (let linha = 0; linha < total_linhas; linha++) {
            matriz_t[linha][coluna] = t_da_coluna;
        }
    }
    return matriz_t;
}

// g = (1 - t) * f1 + t * f2, pixel a pixel
function misturarImagens(imagem1, imagem2, matriz_t) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem1);
    const imagem_final = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const t = matriz_t[linha][coluna];
            const valor = (1 - t) * imagem1[linha][coluna] + t * imagem2[linha][coluna];
            imagem_final[linha][coluna] = limitarPixel(valor);
        }
    }
    return imagem_final;
}


//    tipo: 1 negativo | 2 alargamento de contraste | 3 limiarização
//          4 potência | 5 logaritmo      (ver TIPO_TRANSFORMACAO)
//    parametros: { s_min, s_max }      -> alargamento de contraste
//                { valor_t }           -> limiarização
//                { valor_c, potencia } -> potência (valor_c opcional, padrão 1)
//                { valor_c }           -> logaritmo (opcional, padrão 255/ln(256))


function transformacoesIntensidade(tipo, imagem, parametros = {}) {
    validarImagem(imagem);
    let imagem_final = null;

    switch (tipo) {
        case 1: { // negativo
            imagem_final = aplicarTransformacaoPontual(imagem, calcularNegativo, {});
            break;
        }

        case 2: { // alargamentoContraste
            exigirParametro(parametros, "s_min");
            exigirParametro(parametros, "s_max");
            const limites = encontrarMinimoMaximo(imagem);
            const parametros_alargamento = {
                r_min: limites.valor_minimo,
                r_max: limites.valor_maximo,
                s_min: parametros.s_min,
                s_max: parametros.s_max
            };
            imagem_final = aplicarTransformacaoPontual(imagem, calcularAlargamentoContraste, parametros_alargamento);
            break;
        }

        case 3: { // limiarizacao
            exigirParametro(parametros, "valor_t");
            imagem_final = aplicarTransformacaoPontual(imagem, calcularLimiarizacao, {valor_t: parametros.valor_t});
            break;
        }

        case 4: { // potencia
            exigirParametro(parametros, "potencia");
            let valor_c = 1;
            if (parametros.valor_c !== undefined) {
                exigirParametro(parametros, "valor_c");
                valor_c = parametros.valor_c;
            }
            imagem_final = aplicarTransformacaoPontual(imagem, calcularPotencia, {
                valor_c: valor_c,
                potencia: parametros.potencia
            });
            break;
        }

        case 5: { // logaritmo
            // Com c = 255 / ln(256) o valor 255 continua sendo 255 depois do log.
            let valor_c = limite_L_final / Math.log(1 + limite_L_final);
            if (parametros.valor_c !== undefined) {
                exigirParametro(parametros, "valor_c");
                valor_c = parametros.valor_c;
            }
            imagem_final = aplicarTransformacaoPontual(imagem, calcularLogaritmo, {valor_c: valor_c});
            break;
        }

        default:
            throw new Error("Tipo de transformação inválido: " + tipo);
    }

    return imagem_final;
}

// s = (L - 1) - r
function calcularNegativo(r, parametros) {
    return limite_L_final - r;
}

// s = ((r - r_min) / (r_max - r_min)) * (s_max - s_min) + s_min
function calcularAlargamentoContraste(r, parametros) {
    const {r_min, r_max, s_min, s_max} = parametros;
    if (r_max === r_min) {
        return r;
    }
    const posicao_relativa = (r - r_min) / (r_max - r_min);
    return posicao_relativa * (s_max - s_min) + s_min;
}

// s = 255 se r > T, senão 0
function calcularLimiarizacao(r, parametros) {
    if (r > parametros.valor_t) {
        return limite_L_final;
    }
    return 0;
}

// s = c * r^gama. Os níveis são normalizados para [0, 1] antes da potência
// e reescalados depois; sem isso, c = 1 e gama > 1 estouram 255 quase sempre.
function calcularPotencia(r, parametros) {
    const r_normalizado = r / limite_L_final;
    const s_normalizado = parametros.valor_c * Math.pow(r_normalizado, parametros.potencia);
    return s_normalizado * limite_L_final;
}

// s = c * log(1 + r)
function calcularLogaritmo(r, parametros) {
    return parametros.valor_c * Math.log(1 + r);
}

function histograma(imagem, tipo) {
    validarImagem(imagem);
    const histograma_original = calcularHistograma(imagem);

    let imagem_final = null;
    if (tipo === "expansao") {
        imagem_final = expandirHistograma(imagem);
    } else if (tipo === "equalizacao") {
        imagem_final = equalizarHistograma(imagem);
    } else {
        throw new Error("Tipo de histograma inválido: " + tipo);
    }

    const histograma_final = calcularHistograma(imagem_final);
    return {imagem_final, histograma_original, histograma_final};
}

// histograma[k] = quantidade de pixels com intensidade k
function calcularHistograma(imagem) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const frequencia_pixels = new Array(limite_L_final + 1).fill(0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            frequencia_pixels[imagem[linha][coluna]]++;
        }
    }
    return frequencia_pixels;
}

function calcularFrequenciaAcumulada(frequencia_pixels) {
    const frequencia_acumulada = [];
    let soma_parcial = 0;
    for (let nivel = 0; nivel < frequencia_pixels.length; nivel++) {
        soma_parcial += frequencia_pixels[nivel];
        frequencia_acumulada.push(soma_parcial);
    }
    return frequencia_acumulada;
}

// s = round(((r - r_min) / (r_max - r_min)) * (L - 1))
function expandirHistograma(imagem) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const limites = encontrarMinimoMaximo(imagem);
    const valor_r_minimo = limites.valor_minimo;
    const valor_r_maximo = limites.valor_maximo;

    if (valor_r_maximo === valor_r_minimo) {
        // Um único nível: a fórmula divide por zero, a imagem não muda.
        return copiarMatriz(imagem);
    }

    const imagem_final = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const r = imagem[linha][coluna];
            const s = ((r - valor_r_minimo) / (valor_r_maximo - valor_r_minimo)) * limite_L_final;
            imagem_final[linha][coluna] = limitarPixel(s);
        }
    }
    return imagem_final;
}

// s = round(((L - 1) / (linhas * colunas)) * soma de n_k para k = 0..r)
function equalizarHistograma(imagem) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const total_pixels = total_linhas * total_colunas;

    const frequencia_pixels = calcularHistograma(imagem);
    const frequencia_acumulada = calcularFrequenciaAcumulada(frequencia_pixels);

    // Tabela de mapeamento: nível original -> nível equalizado
    const mapa_equalizacao = [];
    for (let nivel = 0; nivel < frequencia_acumulada.length; nivel++) {
        const nivel_equalizado = (limite_L_final / total_pixels) * frequencia_acumulada[nivel];
        mapa_equalizacao.push(limitarPixel(nivel_equalizado));
    }

    const imagem_final = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            imagem_final[linha][coluna] = mapa_equalizacao[imagem[linha][coluna]];
        }
    }
    return imagem_final;
}

function aplicarContrasteAdaptativo(imagemOriginal, tamanhoVizinhanca, parametroC) {
    validarImagem(imagemOriginal);
    validarTamanhoVizinhanca(tamanhoVizinhanca);
    if (!Number.isFinite(parametroC) || parametroC < 0) {
        throw new Error("O parâmetro c deve ser um número maior ou igual a zero.");
    }

    const dimensoes = obterDimensoes(imagemOriginal);
    const linhas = dimensoes.total_linhas;
    const colunas = dimensoes.total_colunas;
    const imagemProcessada = criarMatriz(linhas, colunas, 0);

    for (let i = 0; i < linhas; i++) {
        for (let j = 0; j < colunas; j++) {
            const media = calcularMediaLocal(imagemOriginal, i, j, tamanhoVizinhanca);
            const desvioPadrao = calcularDesvioPadraoLocal(imagemOriginal, i, j, tamanhoVizinhanca, media);

            const pixelOriginal = imagemOriginal[i][j];
            imagemProcessada[i][j] = calcularNovoPixel(pixelOriginal, media, desvioPadrao, parametroC);
        }
    }
    return imagemProcessada;
}

// Média μ(i, j) dos pixels da vizinhança n x n (sem arredondar).
function calcularMediaLocal(imagem, x, y, n) {
    const vizinhanca = extrairVizinhanca(imagem, x, y, n);
    return calcularMediaDosValores(vizinhanca);
}

// Desvio padrão σ(i, j) da vizinhança n x n (população: divide por N).
function calcularDesvioPadraoLocal(imagem, x, y, n, media) {
    const vizinhanca = extrairVizinhanca(imagem, x, y, n);
    let somaDiferencasQuadradas = 0;
    for (let k = 0; k < vizinhanca.length; k++) {
        const diferenca = vizinhanca[k] - media;
        somaDiferencasQuadradas += diferenca * diferenca;
    }
    const variancia = somaDiferencasQuadradas / vizinhanca.length;
    return Math.sqrt(variancia);
}

function calcularNovoPixel(f_ij, media_ij, desvio_ij, c) {
    let g_ij;
    if (desvio_ij === 0) {
        g_ij = f_ij;
    } else {
        g_ij = media_ij + (c / desvio_ij) * (f_ij - media_ij);
    }
    return limitarPixel(g_ij);
}


function filtragemEspacial(imagem, tipo, tamanhoVizinhanca) {
    if (tipo === "media") {
        return aplicarFiltroMedia(imagem, tamanhoVizinhanca);
    }
    if (tipo === "mediana") {
        return aplicarFiltroMediana(imagem, tamanhoVizinhanca);
    }
    throw new Error("Tipo de filtro inválido: " + tipo);
}

function aplicarFiltroMedia(imagemOriginal, tamanhoVizinhanca) {
    return processarImagem(imagemOriginal, tamanhoVizinhanca, "media");
}

function aplicarFiltroMediana(imagemOriginal, tamanhoVizinhanca) {
    return processarImagem(imagemOriginal, tamanhoVizinhanca, "mediana");
}

// Percorre a imagem e delega o cálculo de cada pixel ao filtro escolhido.
function processarImagem(imagemOriginal, tamanhoVizinhanca, tipoFiltro) {
    validarImagem(imagemOriginal);
    validarTamanhoVizinhanca(tamanhoVizinhanca);
    if (tipoFiltro !== "media" && tipoFiltro !== "mediana") {
        throw new Error("Tipo de filtro inválido: " + tipoFiltro);
    }

    const dimensoes = obterDimensoes(imagemOriginal);
    const linhas = dimensoes.total_linhas;
    const colunas = dimensoes.total_colunas;
    const imagemProcessada = criarMatriz(linhas, colunas, 0);

    for (let i = 0; i < linhas; i++) {
        for (let j = 0; j < colunas; j++) {
            const vizinhanca = extrairVizinhanca(imagemOriginal, i, j, tamanhoVizinhanca);

            if (tipoFiltro === "media") {
                imagemProcessada[i][j] = calcularMedia(vizinhanca);
            } else {
                imagemProcessada[i][j] = calcularMediana(vizinhanca);
            }
        }
    }
    return imagemProcessada;
}

// Filtro da média: soma dos pixels dividida pela quantidade (suaviza/desfoca).
function calcularMedia(pixels) {
    return Math.round(calcularMediaDosValores(pixels));
}

// Filtro da mediana: valor central dos pixels ordenados (remove ruído sal e pimenta).
function calcularMediana(pixels) {
    const pixels_ordenados = pixels.slice().sort(compararNumeros); // copia, para não alterar o original
    const meio = Math.floor(pixels_ordenados.length / 2);

    if (pixels_ordenados.length % 2 !== 0) {
        return pixels_ordenados[meio];
    }
    // Quantidade par (acontece nas bordas): média dos dois centrais
    return Math.round((pixels_ordenados[meio - 1] + pixels_ordenados[meio]) / 2);
}

//  opcoes.tratamento_borda    : "replicar" (padrão) | "zeros" | "espelhar"
//  opcoes.tratamento_intervalo: "cortar" (padrão) | "absoluto" | "normalizar"
//                               | "absoluto_normalizado"
//  opcoes.inverter_mascara    : true (padrão) = convolução de verdade (máscara
//                               girada 180°); false = correlação.
//  A máscara pode ter qualquer tamanho n x m, desde que n e m sejam ímpares.

function convulacaoGenerica(imagem, mascara, offset = 0, opcoes = {}) {
    const tratamento_borda = opcoes.tratamento_borda || "replicar";
    const tratamento_intervalo = opcoes.tratamento_intervalo || "cortar";
    let inverter_mascara = true;
    if (opcoes.inverter_mascara !== undefined) {
        inverter_mascara = opcoes.inverter_mascara;
    }

    // 1) soma dos produtos, sem limitar valores (pode dar negativos e > 255)
    const resposta_bruta = calcularConvolucao(imagem, mascara, tratamento_borda, inverter_mascara);

    // 2) soma do offset
    const resposta_com_offset = somarOffset(resposta_bruta, offset);

    // 3) trazer de volta para [0, 255]
    //    (com "normalizar" o offset é desfeito, pois a escala é recalculada)
    const imagem_final = ajustarParaIntervalo(resposta_com_offset, tratamento_intervalo);
    return imagem_final;
}

// Convolução bruta: devolve números reais (podem ser negativos ou > 255).
function calcularConvolucao(imagem, mascara, tratamento_borda, inverter_mascara) {
    validarImagem(imagem);
    validarMascara(mascara);

    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const linhas_mascara = mascara.length;
    const colunas_mascara = mascara[0].length;
    const deslocamento_linha = Math.floor(linhas_mascara / 2);
    const deslocamento_coluna = Math.floor(colunas_mascara / 2);

    let mascara_usada = mascara;
    if (inverter_mascara) {
        mascara_usada = rotacionarMascara180(mascara);
    }

    const resposta = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {

            let soma = 0;
            for (let i = 0; i < linhas_mascara; i++) {
                for (let j = 0; j < colunas_mascara; j++) {
                    const linha_vizinha = linha + i - deslocamento_linha;
                    const coluna_vizinha = coluna + j - deslocamento_coluna;
                    const valor_f = obterPixelComBorda(imagem, linha_vizinha, coluna_vizinha, tratamento_borda);
                    soma += mascara_usada[i][j] * valor_f;
                }
            }
            resposta[linha][coluna] = soma;
        }
    }
    return resposta;
}

function validarMascara(mascara) {
    if (!Array.isArray(mascara) || mascara.length === 0 || !Array.isArray(mascara[0])) {
        throw new Error("Máscara inválida: era esperada uma matriz.");
    }
    const colunas_mascara = mascara[0].length;
    for (let i = 0; i < mascara.length; i++) {
        if (mascara[i].length !== colunas_mascara) {
            throw new Error("Máscara inválida: linhas com tamanhos diferentes.");
        }
    }
    if (mascara.length % 2 === 0 || colunas_mascara % 2 === 0) {
        throw new Error("A máscara deve ter dimensões ímpares (ex.: 3x3, 3x5, 5x5).");
    }
}

function rotacionarMascara180(mascara) {
    const linhas_mascara = mascara.length;
    const colunas_mascara = mascara[0].length;
    const rotacionada = criarMatriz(linhas_mascara, colunas_mascara, 0);
    for (let i = 0; i < linhas_mascara; i++) {
        for (let j = 0; j < colunas_mascara; j++) {
            rotacionada[linhas_mascara - 1 - i][colunas_mascara - 1 - j] = mascara[i][j];
        }
    }
    return rotacionada;
}

// Lê f(linha, coluna); se a coordenada cair fora da imagem, aplica o tratamento de borda.
function obterPixelComBorda(imagem, linha, coluna, tratamento_borda) {
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const dentro_da_imagem = linha >= 0 && linha < total_linhas &&
        coluna >= 0 && coluna < total_colunas;
    if (dentro_da_imagem) {
        return imagem[linha][coluna];
    }

    switch (tratamento_borda) {
        case "zeros": // fora da imagem vale 0 (borda escura)
            return 0;
        case "replicar": // usa o pixel mais próximo da borda
            return imagem[limitarIndice(linha, total_linhas)][limitarIndice(coluna, total_colunas)];
        case "espelhar": // reflete a imagem na borda
            return imagem[refletirIndice(linha, total_linhas)][refletirIndice(coluna, total_colunas)];
        default:
            throw new Error("Tratamento de borda inválido: " + tratamento_borda);
    }
}

function limitarIndice(indice, total) {
    if (indice < 0) {
        return 0;
    }
    if (indice > total - 1) {
        return total - 1;
    }
    return indice;
}

// Reflexão sem repetir o pixel da borda: ... 2 1 [0 1 2 3] 2 1 ...
function refletirIndice(indice, total) {
    if (total === 1) {
        return 0;
    }
    const periodo = 2 * (total - 1);
    let indice_no_periodo = ((indice % periodo) + periodo) % periodo;
    if (indice_no_periodo >= total) {
        indice_no_periodo = periodo - indice_no_periodo;
    }
    return indice_no_periodo;
}

function somarOffset(matriz, offset) {
    const {total_linhas, total_colunas} = obterDimensoes(matriz);
    const resultado = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            resultado[linha][coluna] = matriz[linha][coluna] + offset;
        }
    }
    return resultado;
}

// Converte uma matriz de números reais para inteiros em [0, 255].
//  "cortar"               : valores < 0 viram 0 e > 255 viram 255
//  "absoluto"             : |valor|, depois corta em 255
//  "normalizar"           : o menor valor vira 0 e o maior vira 255 (mantém o sinal; 0 fica cinza)
//  "absoluto_normalizado" : |valor| reescalado para que o maior módulo vire 255
function ajustarParaIntervalo(matriz_bruta, tratamento) {
    const tratamentos_validos = ["cortar", "absoluto", "normalizar", "absoluto_normalizado"];
    if (tratamentos_validos.indexOf(tratamento) === -1) {
        throw new Error("Tratamento de intervalo inválido: " + tratamento);
    }

    const {total_linhas, total_colunas} = obterDimensoes(matriz_bruta);
    const limites = encontrarMinimoMaximo(matriz_bruta);
    const menor_valor = limites.valor_minimo;
    const maior_valor = limites.valor_maximo;
    const maior_modulo = Math.max(Math.abs(menor_valor), Math.abs(maior_valor));

    const imagem_ajustada = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const valor = matriz_bruta[linha][coluna];
            let valor_ajustado = 0;

            if (tratamento === "cortar") {
                valor_ajustado = valor;
            } else if (tratamento === "absoluto") {
                valor_ajustado = Math.abs(valor);
            } else if (tratamento === "normalizar") {
                if (maior_valor !== menor_valor) {
                    valor_ajustado = ((valor - menor_valor) / (maior_valor - menor_valor)) * limite_L_final;
                }
            } else { // absoluto_normalizado
                if (maior_modulo !== 0) {
                    valor_ajustado = (Math.abs(valor) / maior_modulo) * limite_L_final;
                }
            }
            imagem_ajustada[linha][coluna] = limitarPixel(valor_ajustado);
        }
    }
    return imagem_ajustada;
}

//    g = A * f + sinal * Laplaciano(f)
//      A = 1            -> aguçamento Laplaciano simples
//      A > 1 (high boost) -> parametros.fator_a
//    sinal = -1 se o coeficiente central da máscara é negativo (subtrai a
//    resposta) e +1 se é positivo (soma a resposta).
//    parametros.mascara (opcional): outra máscara Laplaciana (padrão: 4-vizinhos).
//    Devolve a resposta do Laplaciano (para exibir sozinha) e a imagem final.

function agucamento(imagem, tipo, parametros = {}) {
    validarImagem(imagem);

    let fator_a = 1;
    if (tipo === "high-boost") {
        exigirParametro(parametros, "fator_a");
        if (parametros.fator_a < 1) {
            throw new Error("No high boost, A deve ser maior ou igual a 1.");
        }
        fator_a = parametros.fator_a;
    } else if (tipo !== "laplaciano") {
        throw new Error("Tipo de aguçamento inválido: " + tipo);
    }

    let mascara_laplaciano = MASCARA_LAPLACIANO;
    if (parametros.mascara !== undefined) {
        mascara_laplaciano = parametros.mascara;
    }

    // 1) resposta do Laplaciano (com sinal, sem cortar)
    const resposta_laplaciano_bruta = calcularConvolucao(imagem, mascara_laplaciano, "replicar", false);

    // 2) combinação com a imagem original
    const sinal = determinarSinalCombinacao(mascara_laplaciano);
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const imagem_combinada_bruta = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            imagem_combinada_bruta[linha][coluna] =
                fator_a * imagem[linha][coluna] + sinal * resposta_laplaciano_bruta[linha][coluna];
        }
    }

    // 3) saídas: Laplaciano para visualização (0 = cinza médio) e imagem final cortada em [0, 255]
    const resposta_laplaciano = ajustarParaIntervalo(resposta_laplaciano_bruta, "normalizar");
    const imagem_final = ajustarParaIntervalo(imagem_combinada_bruta, "cortar");
    return {resposta_laplaciano, imagem_final};
}

function determinarSinalCombinacao(mascara) {
    const centro_linha = Math.floor(mascara.length / 2);
    const centro_coluna = Math.floor(mascara[0].length / 2);
    if (mascara[centro_linha][centro_coluna] < 0) {
        return -1;
    }
    return 1;
}

//    Devolve { respostas: [{ nome, matriz }, ...], imagem_final }
//      roberts / sobel : Gx, Gy e Magnitude
//      kirsch          : uma resposta por direção (8) e o máximo entre elas
//      laplaciano      : a resposta do operador
//    Os operadores usam correlação (máscaras como nos livros) e borda replicada.

function deteccaoBordas(imagem, tipo) {
    validarImagem(imagem);

    switch (tipo) {
        case "roberts":
            return detectarBordasPorGradiente(imagem, MASCARA_ROBERTS_GX, MASCARA_ROBERTS_GY);
        case "sobel":
            return detectarBordasPorGradiente(imagem, MASCARA_SOBEL_GX, MASCARA_SOBEL_GY);
        case "kirsch":
            return detectarBordasKirsch(imagem);
        case "laplaciano":
            return detectarBordasLaplaciano(imagem);
        default:
            throw new Error("Operador de bordas inválido: " + tipo);
    }
}

function detectarBordasPorGradiente(imagem, mascara_gx, mascara_gy) {
    const gx_bruto = calcularConvolucao(imagem, mascara_gx, "replicar", false);
    const gy_bruto = calcularConvolucao(imagem, mascara_gy, "replicar", false);
    const magnitude_bruta = calcularMagnitudeGradiente(gx_bruto, gy_bruto);

    const respostas = [
        criarResposta("Gx", gx_bruto),
        criarResposta("Gy", gy_bruto),
        criarResposta("Magnitude", magnitude_bruta)
    ];
    const imagem_final = ajustarParaIntervalo(magnitude_bruta, "absoluto_normalizado");
    return {respostas, imagem_final};
}

// magnitude = raiz(Gx² + Gy²)
function calcularMagnitudeGradiente(gx, gy) {
    const {total_linhas, total_colunas} = obterDimensoes(gx);
    const magnitude = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const valor_x = gx[linha][coluna];
            const valor_y = gy[linha][coluna];
            magnitude[linha][coluna] = Math.sqrt(valor_x * valor_x + valor_y * valor_y);
        }
    }
    return magnitude;
}

function detectarBordasKirsch(imagem) {
    const mascaras = gerarMascarasKirsch();
    const respostas_brutas = [];
    const respostas = [];

    for (let k = 0; k < mascaras.length; k++) {
        const resposta_bruta = calcularConvolucao(imagem, mascaras[k], "replicar", false);
        respostas_brutas.push(resposta_bruta);
        respostas.push(criarResposta(NOMES_DIRECOES_KIRSCH[k], resposta_bruta));
    }

    // Resposta final: maior resposta entre as 8 máscaras em cada pixel
    const {total_linhas, total_colunas} = obterDimensoes(imagem);
    const maximo_bruto = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            let maior_resposta = respostas_brutas[0][linha][coluna];
            for (let k = 1; k < respostas_brutas.length; k++) {
                if (respostas_brutas[k][linha][coluna] > maior_resposta) {
                    maior_resposta = respostas_brutas[k][linha][coluna];
                }
            }
            maximo_bruto[linha][coluna] = maior_resposta;
        }
    }

    respostas.push(criarResposta("Máximo", maximo_bruto));
    const imagem_final = ajustarParaIntervalo(maximo_bruto, "absoluto_normalizado");
    return {respostas, imagem_final};
}

// As 8 máscaras de Kirsch são a máscara do Norte girada de 45° em 45°
// (os 8 coeficientes ao redor do centro "andam" uma posição por rotação).
function gerarMascarasKirsch() {
    const mascara_norte = [
        [5, 5, 5],
        [-3, 0, -3],
        [-3, -3, -3]
    ];
    // posições ao redor do centro, em sentido horário
    const posicoes_anel = [
        [0, 0], [0, 1], [0, 2], [1, 2],
        [2, 2], [2, 1], [2, 0], [1, 0]
    ];

    const mascaras = [];
    for (let rotacao = 0; rotacao < 8; rotacao++) {
        const mascara = criarMatriz(3, 3, 0);
        for (let k = 0; k < 8; k++) {
            const origem = posicoes_anel[k];
            const destino = posicoes_anel[(k + rotacao) % 8];
            mascara[destino[0]][destino[1]] = mascara_norte[origem[0]][origem[1]];
        }
        mascaras.push(mascara);
    }
    return mascaras;
}

function detectarBordasLaplaciano(imagem) {
    const resposta_bruta = calcularConvolucao(imagem, MASCARA_LAPLACIANO, "replicar", false);
    const respostas = [criarResposta("Laplaciano", resposta_bruta)];
    const imagem_final = ajustarParaIntervalo(resposta_bruta, "absoluto_normalizado");
    return {respostas, imagem_final};
}

function criarResposta(nome, matriz_bruta) {
    return {nome: nome, matriz: ajustarParaIntervalo(matriz_bruta, "absoluto_normalizado")};
}

function criarMascaraAgucamento(c, d) {
    return [
        [-c, -c, -c],
        [-c, 8 * c + d, -c],
        [-c, -c, -c]
    ];
}

const MASCARA_RELEVO_H1 = [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, -1]
];
const MASCARA_RELEVO_H2 = [
    [0, 0, 2],
    [0, -1, 0],
    [-1, 0, 0]
];
const MASCARA_BORDAS_H3 = [
    [-1, -1, 0],
    [1, 0, 1],
    [0, 1, 1]
];
const MASCARA_BORDAS_H4 = [
    [0, -1, 0],
    [-1, -4, -1],
    [0, -1, 0]
];


// RGBA do canvas -> matriz em escala de cinza (luminância: 0,299 R + 0,587 G + 0,114 B)
function imageDataParaMatriz(image_data) {
    const largura = image_data.width;
    const altura = image_data.height;
    const dados = image_data.data;
    const matriz = criarMatriz(altura, largura, 0);

    for (let linha = 0; linha < altura; linha++) {
        for (let coluna = 0; coluna < largura; coluna++) {
            const indice = (linha * largura + coluna) * 4;
            const vermelho = dados[indice];
            const verde = dados[indice + 1];
            const azul = dados[indice + 2];
            matriz[linha][coluna] = converterRgbParaCinza(vermelho, verde, azul);
        }
    }
    return matriz;
}

// Luminância de um pixel RGB (0,299 R + 0,587 G + 0,114 B), já em [0, 255].
function converterRgbParaCinza(vermelho, verde, azul) {
    return limitarPixel(0.299 * vermelho + 0.587 * verde + 0.114 * azul);
}

// RGBA do canvas -> três matrizes [vermelho, verde, azul], uma por canal.
function imageDataParaCanais(image_data) {
    const largura = image_data.width;
    const altura = image_data.height;
    const dados = image_data.data;
    const vermelho = criarMatriz(altura, largura, 0);
    const verde = criarMatriz(altura, largura, 0);
    const azul = criarMatriz(altura, largura, 0);

    for (let linha = 0; linha < altura; linha++) {
        for (let coluna = 0; coluna < largura; coluna++) {
            const indice = (linha * largura + coluna) * 4;
            vermelho[linha][coluna] = dados[indice];
            verde[linha][coluna] = dados[indice + 1];
            azul[linha][coluna] = dados[indice + 2];
        }
    }
    return [vermelho, verde, azul];
}

// Três canais [R, G, B] -> uma matriz em cinza (luminância).
function converterCanaisParaCinza(canais) {
    const {total_linhas, total_colunas} = obterDimensoes(canais[0]);
    const cinza = criarMatriz(total_linhas, total_colunas, 0);
    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            cinza[linha][coluna] = converterRgbParaCinza(
                canais[0][linha][coluna], canais[1][linha][coluna], canais[2][linha][coluna]);
        }
    }
    return cinza;
}

// Lista de canais -> ImageData. 1 canal = imagem em cinza; 3 canais = imagem colorida.
function canaisParaImageData(canais) {
    if (canais.length === 1) {
        return matrizParaImageData(canais[0]);
    }
    if (canais.length !== 3) {
        throw new Error("Era esperado 1 canal (cinza) ou 3 canais (R, G, B).");
    }
    const {total_linhas, total_colunas} = obterDimensoes(canais[0]);
    const image_data = new ImageData(total_colunas, total_linhas);
    const dados = image_data.data;

    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const indice = (linha * total_colunas + coluna) * 4;
            dados[indice] = canais[0][linha][coluna];
            dados[indice + 1] = canais[1][linha][coluna];
            dados[indice + 2] = canais[2][linha][coluna];
            dados[indice + 3] = 255;
        }
    }
    return image_data;
}

// Matriz em escala de cinza -> ImageData, pronto para ctx.putImageData()
function matrizParaImageData(matriz) {
    const {total_linhas, total_colunas} = obterDimensoes(matriz);
    const image_data = new ImageData(total_colunas, total_linhas);
    const dados = image_data.data;

    for (let linha = 0; linha < total_linhas; linha++) {
        for (let coluna = 0; coluna < total_colunas; coluna++) {
            const indice = (linha * total_colunas + coluna) * 4;
            const valor = matriz[linha][coluna];
            dados[indice] = valor;
            dados[indice + 1] = valor;
            dados[indice + 2] = valor;
            dados[indice + 3] = 255;
        }
    }
    return image_data;
}