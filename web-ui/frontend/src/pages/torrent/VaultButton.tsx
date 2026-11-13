import { useState } from "react";
import { fetchPage, postForm } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { toast } from "../../chrome/Toasts";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import type { TorrentData } from "./types";

type Add = NonNullable<NonNullable<TorrentData["vault"]>["add"]>;
type Remove = NonNullable<NonNullable<TorrentData["vault"]>["remove"]>;

const points = (value: number | null | undefined) =>
  value === null || value === undefined ? "∞" : value.toFixed(2);

/**
 * Save to Vault: a dialog that says what it costs in Vault Points, the way
 * the server prices it (?pledge-form=true), then pledges or takes it back.
 */
export function VaultButton() {
  const { t, path } = useI18n();
  const { data, session } = usePage<TorrentData>();
  const { refresh } = useNavigation();
  const vault = data.vault!;
  const [add, setAdd] = useState<Add | null>(null);
  const [remove, setRemove] = useState<Remove | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const here = location.pathname + location.search;
  const withFlag = (flag: string) => here + (here.includes("?") ? "&" : "?") + `${flag}=true`;

  const show = async () => {
    setOpen(true);
    setWorking(true);
    try {
      const page = await fetchPage<TorrentData>(withFlag(vault.funded ? "pledge-remove-form" : "pledge-form"));
      setAdd(page.data.vault?.add ?? null);
      setRemove(page.data.vault?.remove ?? null);
    } finally {
      setWorking(false);
    }
  };
  const pledge = async (url: string, done: string) => {
    setWorking(true);
    try {
      const page = await postForm<TorrentData>(path(url), { resource_id: data.id }, session);
      const result = page.data?.vault;
      if (result?.add?.status === "error" || result?.remove?.status === "error") {
        setAdd(result.add ?? null);
        setRemove(result.remove ?? null);
        return;
      }
      toast(t(done));
      setOpen(false);
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const enough = !add || add.available === null || add.available >= add.required;
  return (
    <>
      <button type="button" className={vault.funded ? "button on" : "button"} onClick={() => void show()}>
        <Icon name="vault" size={18} />
        {t(vault.funded ? "vault.supporting" : "vault.keepAvailable")}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t(vault.funded ? "vault.removeTitle" : "vault.keepAvailable")}
        subtitle={data.name}
      >
        {working && !add && !remove && <span className="spinner" />}
        {add && (
          <div className="vault-dialog">
            {add.status === "error" ? (
              <div className="notice error">
                <Icon name="alert" />
                <span>
                  {t("vault.error")} {add.errKey && t(add.errKey)}
                </span>
              </div>
            ) : add.vaulted ? (
              <p>{t("vault.alreadyStored")}</p>
            ) : (
              <>
                <p>
                  {add.available === null
                    ? t("vault.unlimitedPoints")
                    : enough
                      ? t("vault.hasPoints")
                      : t("vault.noPoints")}
                </p>
                <dl className="vault-numbers">
                  <div>
                    <dt>{t("vault.torrentSize")}</dt>
                    <dd className="mono">{add.sizeGb.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{t("vault.requiredVP")}</dt>
                    <dd className="mono">{add.required.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{t("vault.availableVP")}</dt>
                    <dd className="mono">{points(add.available)}</dd>
                  </div>
                  <div>
                    <dt>{t("vault.totalVP")}</dt>
                    <dd className="mono">{points(add.total)}</dd>
                  </div>
                </dl>
                {!enough && (
                  <p className="fine">
                    {t("vault.upgradeHint")} <Link href={path("/donate")}>{t("vault.upgradeSubscription")}</Link>
                  </p>
                )}
              </>
            )}
            <div className="dialog-actions">
              <a className="text-link" href={path("/instructions/vault")} target="_blank" rel="noopener">
                {t("vault.whatIs")}
              </a>
              <button type="button" className="button quiet" onClick={() => setOpen(false)}>
                {t("vault.cancel")}
              </button>
              {!add.vaulted && add.status !== "error" && enough && (
                <button
                  type="button"
                  className="button accent"
                  disabled={working}
                  onClick={() => void pledge("/vault/add", "toast.addedToVault")}
                >
                  {t("vault.storeInVault")}
                </button>
              )}
            </div>
          </div>
        )}
        {remove && (
          <div className="vault-dialog">
            {remove.status === "error" ? (
              <div className="notice error">
                <Icon name="alert" />
                <span>
                  {t("vault.removeError")} {remove.errKey && t(remove.errKey)}
                </span>
              </div>
            ) : (
              <p>{t(remove.frozen ? "vault.frozen" : "vault.removeConfirm")}</p>
            )}
            <div className="dialog-actions">
              <button type="button" className="button quiet" onClick={() => setOpen(false)}>
                {t("vault.cancel")}
              </button>
              {!remove.frozen && remove.status !== "error" && (
                <button
                  type="button"
                  className="button danger"
                  disabled={working}
                  onClick={() => void pledge("/vault/remove", "toast.removedFromVault")}
                >
                  {t("vault.removePledge")}
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
