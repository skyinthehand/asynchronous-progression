import { useEffect, useState } from "react";
import type { ManagedPoolOption } from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";
import { runSync } from "../sync/syncRunner.js";
import { TournamentDrillDown } from "./TournamentDrillDown.js";
import { ensurePoolFromOption } from "./poolBootstrap.js";

interface PoolSelectionProps {
  /**
   * 対象プールが変更された直後(同期の成否を待たず)に呼ばれる。管理画面の
   * 他のパネル(対戦台設定等)はマウント時に一度だけプールを読み込むため、
   * ここで変更を伝播しないと「一度一般モードに戻らないと反映されない」
   * 状態になってしまう。
   */
  onPoolChanged?: () => void;
}

/**
 * FR-028: 対象プールのみを、Personal Access Tokenの入力をやり直すことなく
 * 再設定できる(既に保存済みのトークンを流用する)。
 */
export function PoolSelection({ onPoolChanged }: PoolSelectionProps) {
  const [savedToken, setSavedToken] = useState<string | null | undefined>(
    undefined,
  );
  const [savedMessage, setSavedMessage] = useState<
    "idle" | "syncing" | "done" | "error"
  >("idle");

  useEffect(() => {
    getStartggConfig().then((config) =>
      setSavedToken(config?.syncToken ?? null),
    );
  }, []);

  async function handleSelect(option: ManagedPoolOption) {
    const config = await getStartggConfig();
    if (!config) return;
    await saveStartggConfig({
      ...config,
      tournamentSlug: option.tournamentSlug,
      eventId: option.eventId,
      phaseId: option.phaseId,
      poolId: option.poolId,
      tournamentName: option.tournamentName,
      eventName: option.eventName,
      phaseName: option.phaseName,
    });
    await ensurePoolFromOption(option);
    onPoolChanged?.();

    // 定期同期を待たず、選択直後に一度同期を試みる(InitLoginと同様)。
    setSavedMessage("syncing");
    const result = await runSync();
    setSavedMessage(result.success ? "done" : "error");
  }

  return (
    <section className="pool-selection">
      <h3>対象プールのみ変更</h3>
      {savedMessage === "syncing" && <p>対象プールを更新し、同期しています…</p>}
      {savedMessage === "done" && (
        <p>対象プールを更新し、初回同期が完了しました。</p>
      )}
      {savedMessage === "error" && (
        <p role="alert">
          対象プールは更新されましたが、同期に失敗しました。詳細は画面下部の
          通知をご確認ください。
        </p>
      )}
      {savedToken === undefined ? null : savedToken === null ? (
        <p role="alert">
          保存済みのトークンがありません。先に初期化またはトークン設定を
          行ってください。
        </p>
      ) : (
        <TournamentDrillDown token={savedToken} onPoolSelected={handleSelect} />
      )}
    </section>
  );
}
