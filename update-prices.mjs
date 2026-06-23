import fs from 'fs';

const HOLDINGS_FILE = 'holdings.json';
const OUTPUT_FILE = 'prices.json';

// holdings.json からユーザーの保有しているリアルなティッカーを自動抽出
let symbols = [];
if (fs.existsSync(HOLDINGS_FILE)) {
    try {
        const holdings = JSON.parse(fs.readFileSync(HOLDINGS_FILE, 'utf8'));
        // 有効なシンボルを抽出し、重複を完全に排除
        symbols = [...new Set(holdings.map(h => h.symbol).filter(s => s && s.trim() !== ''))];
        console.log(`▶ holdings.json から自動検出された監視銘柄:`, symbols);
    } catch (e) {
        console.error('✕ holdings.json の解析に失敗しました。デフォルトリストで動作します。', e);
    }
}

// 万が一 holdings.json がまだ無い場合の初期フォールバック
if (symbols.length === 0) {
    symbols = ['7203.T', 'AAPL', 'NVDA'];
}

let pricesStore = {};
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        pricesStore = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {}
}

async function fetchPrices() {
    console.log('株価および正式銘柄名の自動集約を開始します...');
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    for (const symbol of symbols) {
        try {
            // 1. 価格推移データの取得
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
            const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': ua } });
            if (!chartRes.ok) throw new Error(`Chart HTTP ${chartRes.status}`);
            
            const chartJson = await chartRes.json();
            const result = chartJson.chart.result[0];
            const quotes = result.indicators.quote[0].close;
            const validQuotes = quotes.filter(q => q !== null && q !== undefined);
            if (validQuotes.length === 0) throw new Error('有効な価格データなし');

            const latestPrice = validQuotes[validQuotes.length - 1];
            const prevPrice   = validQuotes[validQuotes.length - 2] || latestPrice;
            const lastMonthPrice = validQuotes[validQuotes.length - 21] || validQuotes[0];

            // 2. 正式銘柄名の取得
            let symbolName = symbol;
            try {
                const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
                const quoteRes = await fetch(quoteUrl, { headers: { 'User-Agent': ua } });
                if (quoteRes.ok) {
                    const quoteJson = await quoteRes.json();
                    const qResult = quoteJson.quoteResponse.result[0];
                    symbolName = qResult.longName || qResult.shortName || symbol;
                }
            } catch (nameErr) {
                symbolName = pricesStore[symbol]?.name || symbol;
            }

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
