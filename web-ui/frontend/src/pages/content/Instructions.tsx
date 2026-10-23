import type { ReactNode } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Aside, PageHead, Prose, Sheet } from "./kit";

export const namespaces = ["instructions", "vault"];

interface InstructionsData {
  s3Endpoint: string;
  vault?: { freeze: string; expire: string; transferTimeout: string };
}

/** An ordered list of translated steps; `rich` keys may carry links. */
function Steps({ keys }: { keys: string[] }) {
  const { rich, path } = useI18n();
  const profile = { ProfileURL: path("/profile") };
  return (
    <ol>
      {keys.map((key) => (
        <li key={key}>{rich(key, profile)}</li>
      ))}
    </ol>
  );
}

function List({ keys, params }: { keys: string[]; params?: Record<string, string> }) {
  const { rich } = useI18n();
  return (
    <ul>
      {keys.map((key) => (
        <li key={key}>{rich(key, params)}</li>
      ))}
    </ul>
  );
}

function Guide({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <>
      <PageHead title={title} lede={lede} />
      <Sheet>
        <Prose>{children}</Prose>
      </Sheet>
    </>
  );
}

const keys = (prefix: string, names: string[]) => names.map((name) => `${prefix}.${name}`);

function S3() {
  const { t, rich, path } = useI18n();
  const { data } = usePage<InstructionsData>();
  const p = "instructions.s3";
  return (
    <Guide title={t(`${p}.heading`)} lede={t(`${p}.intro`)}>
      <Steps keys={keys(p, ["step1", "step2", "step3"])} />
      <h2>{t(`${p}.rcloneTitle`)}</h2>
      <p>{t(`${p}.rcloneIntro`)}</p>
      <pre>
        <code>
          {`[torrently]
type = s3
provider = Other
endpoint = ${data.s3Endpoint}
access_key_id = <access key>
secret_access_key = <secret key>
region = us-east-1
force_path_style = true`}
        </code>
      </pre>
      <p>{rich(`${p}.rcloneUsage`)}</p>
      <h2>{t(`${p}.clientsTitle`)}</h2>
      <List keys={keys(p, ["clientAws", "clientCyberduck", "clientMount"])} params={{ Endpoint: data.s3Endpoint, ProfileURL: path("/profile") }} />
      <h2>{t(`${p}.bucketsTitle`)}</h2>
      <List keys={keys(p, ["bucketTorrents", "bucketAll", "bucketMovies", "bucketSeries"])} />
      <Aside label={t("instructions.note")}>{rich(`${p}.noteReadOnly`)}</Aside>
      <Aside label={t("instructions.note")}>{rich(`${p}.notePaid`)}</Aside>
    </Guide>
  );
}

function Stremio() {
  const { t, rich, path } = useI18n();
  const p = "instructions.stremio";
  return (
    <Guide title={t(`${p}.heading`)} lede={t(`${p}.intro`)}>
      <div className="notice">
        <p>{rich(`${p}.quick`, { ProfileURL: path("/profile") })}</p>
      </div>
      <Steps keys={keys(p, ["step1", "step2", "step3", "step4"])} />
      <p>{rich(`${p}.result`)}</p>
      <Aside label={t("instructions.note")}>{rich("instructions.paidOnly")}</Aside>
      <Aside label={t("instructions.note")}>{t(`${p}.noteWarmup`)}</Aside>
    </Guide>
  );
}

function StremioAddon() {
  const { t, rich } = useI18n();
  const p = "instructions.stremioAddon";
  return (
    <Guide title={t(`${p}.heading`)} lede={t(`${p}.intro`)}>
      <img src="/pub/stremio-addon.gif" alt="Stremio Addon" loading="lazy" />
      <Steps keys={keys(p, ["step1", "step2", "step3", "step4"])} />
      <p>{t(`${p}.result`)}</p>
      <Aside label={t("instructions.note")}>{rich("instructions.paidOnly")}</Aside>
      <Aside label={t("instructions.note")}>{t(`${p}.noteGathering`)}</Aside>
    </Guide>
  );
}

function Torznab() {
  const { t, rich } = useI18n();
  const p = "instructions.torznab";
  return (
    <Guide title={t(`${p}.heading`)} lede={t(`${p}.intro`)}>
      <Steps keys={keys(p, ["step1", "step2", "step3", "step4"])} />
      <p>{t(`${p}.result`)}</p>
      <Aside label={t("instructions.important")} tone="warn">
        {rich(`${p}.noteReachable`)}
      </Aside>
      <Aside label={t("instructions.note")}>{rich(`${p}.noteHttps`)}</Aside>
    </Guide>
  );
}

function Vault() {
  const { t, rich } = useI18n();
  const { data } = usePage<InstructionsData>();
  const p = "instructions.vault";
  const vault = data.vault;
  return (
    <Guide title={t(`${p}.title`)} lede={t("vault.signInCard.intro")}>
      <List keys={keys("vault.signInCard", ["feature1", "feature2", "feature3", "feature4"])} />
      <h2>{t(`${p}.vpTitle`)}</h2>
      <List keys={keys(p, ["vpUnit", "vpSource"])} />
      {vault && (
        <>
          <h2>{t(`${p}.howTitle`)}</h2>
          <ol>
            <li>{rich(`${p}.howStep1`)}</li>
            <li>{t(`${p}.howStep2`)}</li>
            <li>{rich(`${p}.howStep3`, { FreezePeriod: vault.freeze })}</li>
            <li>{rich(`${p}.howStep4`, { TransferTimeout: vault.transferTimeout })}</li>
          </ol>
          <h2>{t(`${p}.claimTitle`)}</h2>
          <List keys={keys(p, ["claimItem1", "claimItem2", "claimItem3"])} params={{ ExpirePeriod: vault.expire }} />
          <h2>{t(`${p}.expireTitle`)}</h2>
          <List keys={keys(p, ["expireItem1", "expireItem2"])} params={{ ExpirePeriod: vault.expire }} />
        </>
      )}
      <Aside label={t("instructions.important")} tone="warn">
        {t(`${p}.disclaimer`)}
      </Aside>
    </Guide>
  );
}

function Webdav() {
  const { t, rich } = useI18n();
  const p = "instructions.webdav";
  return (
    <Guide title={t(`${p}.heading`)} lede={t(`${p}.intro`)}>
      <Steps keys={keys(p, ["step1", "step2", "step3"])} />
      <h2>{t(`${p}.clientsTitle`)}</h2>
      <List keys={keys(p, ["clientWindows", "clientMac", "clientMobile", "clientAdvanced"])} />
      <h2>{t(`${p}.foldersTitle`)}</h2>
      <List keys={keys(p, ["folderTorrents", "folderAll", "folderMovies", "folderSeries"])} />
      <Aside label={t("instructions.note")}>{rich(`${p}.notePaid`)}</Aside>
    </Guide>
  );
}

const guides: Record<string, () => ReactNode> = {
  "instructions/s3": S3,
  "instructions/stremio": Stremio,
  "instructions/stremio_addon": StremioAddon,
  "instructions/torznab": Torznab,
  "instructions/vault": Vault,
  "instructions/webdav": Webdav,
};

export default function Instructions() {
  const { view } = usePage<InstructionsData>();
  const Shown = guides[view] ?? Webdav;
  return <Shown />;
}
