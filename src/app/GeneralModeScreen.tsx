import { PoolProgressScreen } from "../features/pool-progress/PoolProgressScreen.js";
import { useAppMode } from "./router.js";

/**
 * 進行担当者向けの一般モード画面。次戦案内(US4)・結果修正(US6)・
 * 印刷(US7)は、実装が進むにつれてここに組み込まれる。
 */
export function GeneralModeScreen() {
  const { enterAdminMode } = useAppMode();
  return (
    <div className="screen general-mode-screen">
      <header className="screen-header">
        <h1>予選プール進行</h1>
        <button type="button" onClick={enterAdminMode}>
          管理画面
        </button>
      </header>
      <PoolProgressScreen />
    </div>
  );
}
