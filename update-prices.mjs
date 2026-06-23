import fs from 'fs';

// ユーザーが管理したい国内株・米国株のシンボル一覧（Yahoo Finance形式）
// ここに並べた銘柄の名前と株価が、毎晩Actionsによって自動集約されます
const SYMBOLS = [
    '2157.T', // コシダカHD
    '2337.T', // いちご
    '3246.T', // コーセーアールイー
    '4668.T', // 明光ネット
    '6904.T', // 原田工業
    '7085.T', // カーブスHD
    '7294.T', // ヨロズ
    '8165.T', // 千趣会
    '8173.T', // JOSHIN
    '8742.T', // 小林洋行
    '9765.T', // オオバ    
    'INTC',   // INTL
    'MSFT',   // MICROSOFT
];

const OUTPUT_FILE = 'prices.json';

// 既存のデータを読み込み（失敗時の据え置き用）
let pricesStore = {};
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        pricesStore = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {
        console.log('既存の prices.json の読み込みに失敗しました。');
    }
}

async function fetchPrices() {
    console.log('株価および正式銘柄名の自動集約を開始します...');
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    for (const symbol of SYMBOLS) {
        try {
            // 1. 価格推移データの取得 (chartエンドポイント)
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
            const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': ua } });
            if (!chartRes.ok) throw new Error(`Chart HTTPエラー: ${chartRes.status}`);
            
            const chartJson = await chartRes.json();
            const result = chartJson.chart.result[0];
            const quotes = result.indicators.quote[0].close;
            const validQuotes = quotes.filter(q => q !== null && q !== undefined);
            if (validQuotes.length === 0) throw new Error('有効な価格データがありません');

            const latestPrice = validQuotes[validQuotes.length - 1];              // 最新終値
            const prevPrice   = validQuotes[validQuotes.length - 2] || latestPrice; // 前営業日
            const lastMonthPrice = validQuotes[validQuotes.length - 21] || validQuotes[0]; // 前月比用

            // 2. 正式銘柄名（会社名）の取得 (quoteエンドポイント)
            let symbolName = symbol;
            try {
                const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
                const quoteRes = await fetch(quoteUrl, { headers: { 'User-Agent': ua } });
                if (quoteRes.ok) {
                    const quoteJson = await quoteRes.json();
                    const qResult = quoteJson.quoteResponse.result[0];
                    // longName（正式社名）が取れれば採用、なければshortName
                    symbolName = qResult.longName || qResult.shortName || symbol;
                }
            } catch (nameErr) {
                console.log(`  ※ ${symbol} の銘柄名取得に失敗しました。古い名称、またはコード名を維持します。`);
                symbolName = pricesStore[symbol]?.name || symbol;
            }

            // ストアに成果物を一本化して保存
            pricesStore[symbol] = {
                name: symbolName,
                price: latestPrice,
                prev: prevPrice,
                month: lastMonthPrice,
                updatedAt: new Date().toISOString()
            };
            
            console.log(`✓ 取得成功: ${symbol} [${symbolName}] = ${latestPrice}`);
            
        } catch (error) {
            console.error(`✕ 取得失敗: ${symbol} (${error.message}) - 古い値を維持します。`);
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pricesStore, null, 2), 'utf8');
    console.log('prices.json の書き出しが完了しました。');
}

fetchPrices();
