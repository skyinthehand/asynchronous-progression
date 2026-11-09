/**
 * ユーザーフィードバック(2026-11-09): 開発版として一時的に公開するため、
 * β版であることをどの画面(ログイン画面・進行ルールの確認を含む)でも
 * 分かるように示す。正式版にするときは、この部品(App.tsxの<BetaBanner />)
 * とindex.htmlの<title>の「【β版】」を外す。
 */
export function BetaBanner() {
  return (
    <div className="beta-banner no-print" role="note">
      <span className="beta-banner-badge">β版</span>
      <span>
        開発中の試験版です。動作が変わったり不具合があったりする場合があります。
      </span>
    </div>
  );
}
