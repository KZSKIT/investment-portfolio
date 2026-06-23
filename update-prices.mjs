import fs from 'fs';

const HOLDINGS_FILE = 'holdings.json';
const OUTPUT_FILE = 'prices.json';

// holdings.json からユーザーの保有しているリアルなティッカーを自動抽出
let symbols = [];
if (fs.existsSync(HOLDINGS_FILE)) {
    try {
        const holdings = JSON.parse(fs.readFileSync(HOLDINGS_FILE, 'utf8'));
        symbols = [...new Set(holdings.map(h => h.symbol).filter(s => s && s.trim() !== ''))];
        console.log(`▶ holdings.json から自動検出された監視銘柄:`, symbols);
    } catch (e) {
        console.error('✕ holdings.json の解析に失敗しました。デフォルトリストで動作します。', e);
    }
}

// 初期フォールバック
if (symbols.length === 0) {
    symbols = ['7203.T', 'AAPL', 'NVDA'];
}

// 【重要】米国株の円換算推移を完全に再現するため、ドル円為替レート(JPY=X)を常に監視対象へ強制追加
if (!symbols.includes('JPY=X')) {
    symbols.push('JPY=X');
}

let pricesStore = {};
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        pricesStore = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPrices() {
    console.log('株価・為替の過去1年分のヒストリカルデータ自動集約を開始します...');
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    for (const symbol of symbols) {
        await sleep(1000); // Yahoo Financeへの礼儀（IPブロック対策）

        let currentCache = pricesStore[symbol] || {
            name: symbol === 'JPY=X' ? '米ドル/円' : symbol,
            price: 0,
            prev: 0,
            month: 0,
            updatedAt: new Date().toISOString(),
            history: {}
        };

        try {
            // 過去1年分（range=1y）の日次チャートデータを取得
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
            const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': ua } });
            if (!chartRes.ok) throw new Error(`Chart HTTP ${chartRes.status}`);
            
            const chartJson = await chartRes.json();
            const result = chartJson.chart.result[0];
            
            const timestamps = result.timestamp || [];
            const quotes = result.indicators.quote[0].close || [];
            
            // 有効な価格データのみフィルタ
            const validQuotes = quotes.filter(q => q !== null && q !== undefined);
            if (validQuotes.length === 0) throw new Error('有効な価格データなし');

            currentCache.price = validQuotes[validQuotes.length - 1];
            currentCache.prev  = validQuotes[validQuotes.length - 2] || currentCache.price;
            currentCache.month = validQuotes[validQuotes.length - 21] || validQuotes[0];

            // 日付ごとの価格履歴（historyマップ）を構築
            const historyMap = {};
            for (let i = 0; i < timestamps.length; i++) {
                if (quotes[i] !== null && quotes[i] !== undefined) {
                    // 日本時間（JST）ベースの日付文字列（YYYY-MM-DD）に変換してキーにする
                    const dateStr = new Date(timestamps[i] * 1000 + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
                    historyMap[dateStr] = quotes[i];
                }
            }
            currentCache.history = historyMap;

            // 2. 正式銘柄名の取得（為替レート以外）
            if (symbol !== 'JPY=X') {
                try {
                    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
                    const quoteRes = await fetch(quoteUrl, { headers: { 'User-Agent': ua } });
                    if (quoteRes.ok) {
                        const quoteJson = await quoteRes.json();
                        const qResult = quoteJson.quoteResponse.result[0];
                        currentCache.name = qResult.longName || qResult.shortName || currentCache.name;
                    }
                } catch (nameErr) {
                    currentCache.name = pricesStore[symbol]?.name || symbol;
                }
            }

            currentCache.updatedAt = new Date().toISOString();
            pricesStore[symbol] = currentCache;
            console.log(`✓ 取得成功: ${symbol} [${currentCache.name}] = ${currentCache.price}`);
            
        } catch (error) {
            console.error(`✕ 取得失敗: ${symbol} (${error.message}) - 古い値を維持します。`);
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pricesStore, null, 2), 'utf8');
    console.log('prices.json の書き出しが完了しました。');
}

fetchPrices();
