import { usePendingActivationMessages } from "./pendingActivation";
import { Link } from "react-router-dom";

export function PendingActivationNotice({ preview = false }: { preview?: boolean }) {
  const message = usePendingActivationMessages();
  return <section className="card" role="status" data-pending-activation style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <h2>{message.title}</h2>
    <p>{message.body}</p>
    <p>{message.plan}</p>
    {preview ? <p>{message.preview}</p> : null}
    <Link className="button secondary" to="/admin/settings/betriebsverifizierung">{message.verification}</Link>
  </section>;
}
