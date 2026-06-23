import fs from 'fs';

// 取得対象の国内株・米国株シンボル（Yahoo Finance形式）
// サンプルデータで使用している銘柄のコードです
const SYMBOLS = [
    '2153.T', // コシダカHD
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

// 既存の価格データを読み込み（失敗時の据え置き用）
let pricesStore = {};
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        pricesStore = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {
        console.log('既存の prices.json の読み込みに失敗しました。新規作成します。');
    }
}

async function fetchPrices() {
    console.log('株価の自動取得を開始します...');
    
    for (const symbol of SYMBOLS) {
        try {
            // range=3mo で直近3ヶ月分の日次データを1発で取得
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            
            if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
            
            const json = await res.json();
            const result = json.chart.result[0];
            const quotes = result.indicators.quote[0].close;
            
            // ヌル値（休場日など）を除外した有効な終値の配列を作る
            const validQuotes = quotes.filter(q => q !== null && q !== undefined);
            
            if (validQuotes.length === 0) throw new Error('有効な価格データがありません');

            const latestPrice = validQuotes[validQuotes.length - 1];              // 最新終値
            const prevPrice   = validQuotes[validQuotes.length - 2] || latestPrice; // 前営業日終値
            // 前月比用：約20営業日前（1ヶ月前）の終値。足りなければ最古の値
            const lastMonthPrice = validQuotes[validQuotes.length - 21] || validQuotes[0]; 

            // ストアに保存（成功時のみ上書き）
            pricesStore[symbol] = {
                price: latestPrice,
                prev: prevPrice,
                month: lastMonthPrice,
                updatedAt: new Date().toISOString()
            };
            
            console.log(`✓ 取得成功: ${symbol} = ${latestPrice}`);
            
        } catch (error) {
            console.error(`✕ 取得失敗: ${symbol} (${error.message}) - 古い値を維持します。`);
            // エラー時は既存の pricesStore[symbol] の値がそのまま維持されます
        }
    }

    // 成果物を JSON ファイルとして書き出し
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pricesStore, null, 2), 'utf8');
    console.log('prices.json の書き出しが完了しました。');
}

fetchPrices();
