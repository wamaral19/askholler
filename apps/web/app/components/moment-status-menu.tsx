import { useRef } from "react";
import { Form, Link, useFetcher } from "react-router";

import {
  momentTransitionLabel,
  momentTransitionsFrom,
} from "../lib/moment-status";
import type { MomentStatus } from "../lib/prototype-data";

interface MomentStatusMenuProps {
  readonly moment: {
    readonly id: string;
    readonly name: string;
    readonly status: MomentStatus;
  };
  /** General calls pause and resume; they never complete or get removed. */
  readonly general?: boolean;
  /** Where a draft launches from; omit on the setup page itself. */
  readonly launchHref?: string;
}

/**
 * "Change status" for one angle. Posts to the Live angles action: status
 * changes stay on the current page, removing an angle lands on the list.
 */
export function MomentStatusMenu({
  moment,
  general = false,
  launchHref,
}: MomentStatusMenuProps) {
  const fetcher = useFetcher();
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute("open");
  const transitions = momentTransitionsFrom(moment.status).filter(
    (status) => !general || status !== "completed",
  );

  return (
    <details className="status-menu" ref={menu}>
      <summary className="button button-small">Change status</summary>
      <div className="status-menu__panel">
        {transitions.map((status) => (
          <fetcher.Form
            action="/moments"
            key={status}
            method="post"
            onSubmit={close}
          >
            <input name="intent" type="hidden" value="set_status" />
            <input name="momentId" type="hidden" value={moment.id} />
            <button
              className="status-menu__item"
              disabled={fetcher.state !== "idle"}
              name="status"
              type="submit"
              value={status}
            >
              {momentTransitionLabel(moment.status, status)}
            </button>
          </fetcher.Form>
        ))}
        {moment.status === "draft" && launchHref ? (
          <Link className="status-menu__item" to={launchHref}>
            Launch from setup…
          </Link>
        ) : null}
        {general ? null : (
          <Form
            action="/moments"
            method="post"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `Remove “${moment.name}”? It stops sending orders to the queue right away. Calls already made stay under Completed calls.`,
                )
              )
                event.preventDefault();
              else close();
            }}
          >
            <input name="intent" type="hidden" value="delete" />
            <input name="momentId" type="hidden" value={moment.id} />
            <button
              className="status-menu__item status-menu__item--danger"
              type="submit"
            >
              Remove angle
            </button>
          </Form>
        )}
      </div>
    </details>
  );
}
