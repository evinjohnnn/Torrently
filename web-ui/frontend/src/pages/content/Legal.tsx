import { usePage } from "../../app/router";
import { PageHead, Prose, Sheet } from "./kit";

// The legal text is English everywhere (CLAUDE.md) and comes as the
// template's own markup (handlers/spa/legal.go): one source for both UIs.
export const namespaces: string[] = [];

interface LegalData {
  title: string;
  updated?: string;
  html: string;
}

export default function Legal() {
  const { data } = usePage<LegalData>();
  return (
    <>
      <PageHead title={data.title}>{data.updated && <p className="page-meta">{data.updated}</p>}</PageHead>
      <Sheet>
        <Prose className="legal-text">
          <div className="legal-body" dangerouslySetInnerHTML={{ __html: data.html }} />
        </Prose>
      </Sheet>
    </>
  );
}
