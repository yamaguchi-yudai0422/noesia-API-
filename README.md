# noesia 人格再現 実験カレンダー

人格再現の実験用に作った、最小構成の静的Webアプリです。

- カレンダーの日付ごとにメモを書ける
- AIコメントを生成できる
- メモが空でもコメント生成を試せる
- データはブラウザの `localStorage` に保存される
- 利用者ごとに自分のAPIキーを入力できる

## ファイル

- `index.html`: UI本体
- `styles.css`: 見た目
- `app.js`: カレンダー処理、保存、API呼び出し
- `config.js`: 任意のプロキシ設定
- `PRODUCT_PLAN.md`: 企画メモ

## ローカルで試す

`index.html` をブラウザで開くだけで動きます。

## GitHub Pages

静的サイトとしてそのまま公開できます。

```powershell
git init
git add .
git commit -m "Initial experiment app"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

その後、GitHub Pages をリポジトリのルート公開に設定してください。

## APIキーの扱い

利用者は画面内の設定欄に、自分で発行した `sk_...` を入力できます。  
APIキーはその利用者のブラウザの `localStorage` にだけ保存されます。

動作モード:

- `Demo`: APIキー未設定。モック応答
- `Direct API`: 利用者のAPIキーで `noesia` を直接呼ぶ
- `Proxy API`: `config.js` に設定したプロキシ経由で呼ぶ

## 注意

`Direct API` は公開実験にいちばん軽い方式ですが、ブラウザからの直接アクセスが `noesia` 側の CORS 設定で許可されている必要があります。  
もしブラウザで直接呼べない場合は、`Proxy API` を使ってください。

## プロキシを使う場合

`config.js`

```js
window.APP_CONFIG = {
  mode: "api",
  noesiaProxyUrl: "https://your-proxy.example.com/noesia-chat",
  defaultChatApiUrl: "https://noesia.onrender.com/v1/chat",
};
```
