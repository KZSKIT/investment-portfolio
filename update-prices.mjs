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

// 連続アクセスによるIPブロックを防ぐためのウェイト関数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPrices() {
    console.log('株価および正式銘柄名の自動集約を開始します...');
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    for (const symbol of symbols) {
        // Yahoo Financeへの礼儀として、リクエスト間に1秒のウェイトを挿入（IPブロック対策）
        await sleep(1000);

        // 既存のキャッシュがあればベースラインとして引き継ぐ（完全なデータ消失を防ぐ防壁）
        let currentCache = pricesStore[symbol] || {
            name: symbol,
            price: 0,
            prev: 0,
            month: 0,
            updatedAt: new Date().toISOString()
        };

        try {
            // 1. 価格推移データの取得 (v8 chart)
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
            const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': ua } });
            
            if (chartRes.ok) {
                const chartJson = await chartRes.json();
                if (chartJson.chart?.result?.[0]) {
                    const result = chartJson.chart.result[0];
                    const quotes = result.indicators?.quote?.[0]?.close || [];
                    const validQuotes = quotes.filter(q => q !== null && q !== undefined);
                    
                    if (validQuotes.length > 0) {
                        currentCache.price = validQuotes[validQuotes.length - 1];
                        currentCache.prev  = validQuotes[validQuotes.length - 2] || currentCache.price;
                        currentCache.month = validQuotes[validQuotes.length - 21] || validQuotes[0];
                    }
                }
            } else {
                console.warn(`⚠ ${symbol} のチャートデータ取得に失敗 (HTTP ${chartRes.status})`);
            }

            // 2. 正式銘柄名の取得 (v7 quote)
            try {
                const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
                const quoteRes = await fetch(quoteUrl, { headers: { 'User-Agent': ua } });
                if (quoteRes.ok) {
                    const quoteJson = await quoteRes.json();
                    const qResult = quoteJson.quoteResponse?.result?.[0];
                    if (qResult) {
                        // 正式社名を優先し、なければショートネーム、それも無ければ既存キャッシュを維持
                        currentCache.name = qResult.longName || qResult.shortName || currentCache.name;
                    }
                }
            } catch (nameErr) {
                console.warn(`⚠ ${symbol} の正式名称取得でエラーが発生しました。古い値を維持します。`);
            }

            // タイムスタンプを更新してストアに格納
            currentCache.updatedAt = new Date().toISOString();
            pricesStore[symbol] = currentCache;
            
            console.log(`✓ 集約成功: ${symbol} [${currentCache.name}] = ¥${currentCache.price}`);
            
        } catch (error) {
            console.error(`✕ 取得失敗: ${symbol} (${error.message}) - 既存データを保護します。`);
        }
    }

    // 最後に一括して保存
    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pricesStore, null, 2), 'utf8');
        console.log('✓ prices.json の書き出しが完了しました。');
    } catch (err) {
        console.error('✕ prices.json の保存に失敗しました。', err);
    }
}

fetchPrices();
