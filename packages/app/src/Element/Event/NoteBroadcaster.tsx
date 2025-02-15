import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { removeUndefined, unwrap } from "@snort/shared";
import { NostrEvent, OkResponse } from "@snort/system";

import AsyncButton from "Element/AsyncButton";
import Icon from "Icons/Icon";
import { getRelayName, sanitizeRelayUrl } from "SnortUtils";
import { removeRelay } from "Login";
import useLogin from "Hooks/useLogin";
import useEventPublisher from "Hooks/useEventPublisher";

export function NoteBroadcaster({
  evs,
  onClose,
  customRelays,
}: {
  evs: Array<NostrEvent>;
  onClose: () => void;
  customRelays?: Array<string>;
}) {
  const [results, setResults] = useState<Array<OkResponse>>([]);
  const { formatMessage } = useIntl();
  const login = useLogin();
  const { publisher, system } = useEventPublisher();

  async function sendEventToRelays(ev: NostrEvent) {
    if (customRelays) {
      return removeUndefined(
        await Promise.all(
          customRelays.map(async r => {
            try {
              return await system.WriteOnceToRelay(r, ev);
            } catch (e) {
              console.error(e);
            }
          }),
        ),
      );
    } else {
      return await system.BroadcastEvent(ev, r => setResults(x => [...x, r]));
    }
  }

  async function sendNote() {
    const results = await Promise.all(evs.map(a => sendEventToRelays(a)).flat());
    if (results.flat().every(a => a.ok)) {
      onClose();
    }
  }

  useEffect(() => {
    sendNote().catch(console.error);
  }, []);

  async function removeRelayFromResult(r: OkResponse) {
    if (publisher) {
      removeRelay(login, unwrap(sanitizeRelayUrl(r.relay)));
      const ev = await publisher.contactList(login.follows.item, login.relays.item);
      await system.BroadcastEvent(ev);
      setResults(s => s.filter(a => a.relay !== r.relay));
    }
  }

  async function retryPublish(r: OkResponse) {
    const ev = evs.find(a => a.id === r.id);
    if (ev) {
      const rsp = await system.WriteOnceToRelay(unwrap(sanitizeRelayUrl(r.relay)), ev);
      setResults(s =>
        s.map(x => {
          if (x.relay === r.relay && x.id === r.id) {
            return rsp; //replace with new response
          }
          return x;
        }),
      );
    }
  }

  return (
    <div className="flex-column g16">
      <h3>
        <FormattedMessage defaultMessage="Sending notes and other stuff" />
      </h3>
      {results
        .filter(a => a.message !== "Duplicate request")
        .sort(a => (a.ok ? -1 : 1))
        .map(r => (
          <div className="flex-row g16">
            <Icon name={r.ok ? "check" : "x"} className={r.ok ? "success" : "error"} size={24} />
            <div className="flex-column f-grow g4">
              <b>{getRelayName(r.relay)}</b>
              {r.message && <small>{r.message}</small>}
            </div>
            {!r.ok && (
              <div className="flex g8">
                <AsyncButton
                  onClick={() => retryPublish(r)}
                  className="p4 br-compact flex f-center secondary"
                  title={formatMessage({
                    defaultMessage: "Retry publishing",
                  })}>
                  <Icon name="refresh-ccw-01" />
                </AsyncButton>
                <AsyncButton
                  onClick={() => removeRelayFromResult(r)}
                  className="p4 br-compact flex f-center secondary"
                  title={formatMessage({
                    defaultMessage: "Remove from my relays",
                  })}>
                  <Icon name="trash-01" className="trash-icon" />
                </AsyncButton>
              </div>
            )}
          </div>
        ))}
      <div className="flex-row g8">
        <button type="button" onClick={() => onClose()}>
          <FormattedMessage defaultMessage="Close" />
        </button>
      </div>
    </div>
  );
}
