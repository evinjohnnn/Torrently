import { useState, type FormEvent } from "react";
import { formData } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import "../account/account.css";
import "./device.css";

export const namespaces = ["device"];

// Mirrors handlers/spa/device.go.
interface DeviceData {
  state: "input" | "confirm" | "invalid" | "done";
  code?: string;
  deviceName?: string;
}

/** Asks for the code a device showed (GET /device?code=), then for consent. */
function CodeForm() {
  const { t, path } = useI18n();
  const { data } = usePage<DeviceData>();
  const { navigate, busy } = useNavigation();
  const [code, setCode] = useState(data.code ?? "");
  const send = (event: FormEvent) => {
    event.preventDefault();
    void navigate(`${path("/device")}?${new URLSearchParams({ code })}`, { scroll: false });
  };
  return (
    <form className="device-form" method="get" action={path("/device")} onSubmit={send}>
      <div className="field">
        <label htmlFor="device-code">{t("device.codeLabel")}</label>
        <input
          id="device-code"
          name="code"
          className="input device-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
        />
      </div>
      <button type="submit" className="button accent large" disabled={busy}>
        {t("device.continue")}
      </button>
    </form>
  );
}

export default function Device() {
  const { t, path } = useI18n();
  const { data } = usePage<DeviceData>();
  const { submit, busy } = useNavigation();
  return (
    <div className="wrap account-page narrow">
      <section className="solo glass">
        <h1>{t("device.title")}</h1>
        {data.state === "done" ? (
          <div className="device-done">
            <span className="device-mark" aria-hidden="true">
              <Icon name="check" size={20} />
            </span>
            <div>
              <h2>{t("device.doneTitle")}</h2>
              <p>{t("device.doneText")}</p>
            </div>
          </div>
        ) : data.state === "confirm" ? (
          <>
            <p>{t("device.subtitle")}</p>
            <div className="device-grant">
              <span className="device-code-shown mono">{data.code}</span>
              {data.deviceName && <span className="muted">{data.deviceName}</span>}
            </div>
            <p>{t("device.grantNote")}</p>
            <div className="device-actions">
              <button
                type="button"
                className="button accent large"
                disabled={busy}
                onClick={() =>
                  void submit(path("/device/confirm"), formData({ code: data.code }), { scroll: false })
                }
              >
                {t("device.confirm")}
              </button>
              <Link className="button large" href={path("/device")}>
                {t("device.cancel")}
              </Link>
            </div>
          </>
        ) : (
          <>
            {data.state === "invalid" ? (
              <div className="notice error" role="alert">
                <Icon name="alert" />
                <span>{t("device.invalidText")}</span>
              </div>
            ) : (
              <p>{t("device.subtitle")}</p>
            )}
            <CodeForm key={data.code ?? ""} />
          </>
        )}
      </section>
    </div>
  );
}
