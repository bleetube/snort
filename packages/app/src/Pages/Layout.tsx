import "./Layout.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { useUserProfile } from "@snort/system-react";
import { NostrLink, NostrPrefix, tryParseNostrLink } from "@snort/system";

import messages from "./messages";

import Icon from "Icons/Icon";
import useLoginFeed from "Feed/LoginFeed";
import { NoteCreator } from "Element/Event/NoteCreator";
import { mapPlanName } from "./subscribe";
import useLogin from "Hooks/useLogin";
import Avatar from "Element/User/Avatar";
import { isFormElement, profileLink } from "SnortUtils";
import { getCurrentSubscription } from "Subscription";
import Toaster from "Toaster";
import Spinner from "Icons/Spinner";
import { fetchNip05Pubkey } from "Nip05/Verifier";
import { useTheme } from "Hooks/useTheme";
import { useLoginRelays } from "Hooks/useLoginRelays";
import { useNoteCreator } from "State/NoteCreator";
import { LoginUnlock } from "Element/PinPrompt";
import useKeyboardShortcut from "Hooks/useKeyboardShortcut";
import { LoginStore } from "Login";

export default function Layout() {
  const location = useLocation();
  const [pageClass, setPageClass] = useState("page");
  const { id, stalker } = useLogin(s => ({ id: s.id, stalker: s.stalker ?? false }));

  useLoginFeed();
  useTheme();
  useLoginRelays();
  useKeyboardShortcut(".", event => {
    // if event happened in a form element, do nothing, otherwise focus on search input
    if (event.target && !isFormElement(event.target as HTMLElement)) {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  });

  const shouldHideHeader = useMemo(() => {
    const hideOn = ["/login", "/new"];
    return hideOn.some(a => location.pathname.startsWith(a));
  }, [location]);

  useEffect(() => {
    const widePage = ["/login", "/messages"];
    const noScroll = ["/messages"];
    if (widePage.some(a => location.pathname.startsWith(a))) {
      setPageClass(noScroll.some(a => location.pathname.startsWith(a)) ? "scroll-lock" : "");
    } else {
      setPageClass("page");
    }
  }, [location]);

  return (
    <>
      <div className={pageClass}>
        {!shouldHideHeader && (
          <header className="main-content">
            <LogoHeader />
            <AccountHeader />
          </header>
        )}
        <Outlet />
        <NoteCreatorButton />
        <Toaster />
      </div>
      <LoginUnlock />
      {stalker && (
        <div
          className="stalker"
          onClick={() => {
            LoginStore.removeSession(id);
          }}>
          <button type="button" className="btn btn-rnd">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}

const NoteCreatorButton = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { readonly } = useLogin(s => ({ readonly: s.readonly }));
  const { show, replyTo, update } = useNoteCreator(v => ({ show: v.show, replyTo: v.replyTo, update: v.update }));

  useKeyboardShortcut("n", event => {
    // if event happened in a form element, do nothing, otherwise focus on search input
    if (event.target && !isFormElement(event.target as HTMLElement)) {
      event.preventDefault();
      if (buttonRef.current) {
        buttonRef.current.click();
      }
    }
  });

  const shouldHideNoteCreator = useMemo(() => {
    const isReplyNoteCreatorShowing = replyTo && show;
    const hideOn = ["/settings", "/messages", "/new", "/login", "/donate", "/e", "/subscribe"];
    return readonly || isReplyNoteCreatorShowing || hideOn.some(a => location.pathname.startsWith(a));
  }, [location, readonly]);

  if (shouldHideNoteCreator) return;
  return (
    <>
      <button
        ref={buttonRef}
        className="primary note-create-button"
        onClick={() =>
          update(v => {
            v.replyTo = undefined;
            v.show = true;
          })
        }>
        <Icon name="plus" size={16} />
      </button>
      <NoteCreator key="global-note-creator" />
    </>
  );
};

const AccountHeader = () => {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();

  useKeyboardShortcut("/", event => {
    // if event happened in a form element, do nothing, otherwise focus on search input
    if (event.target && !isFormElement(event.target as HTMLElement)) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>(".search input")?.focus();
    }
  });

  const { publicKey, latestNotification, readNotifications, readonly } = useLogin(s => ({
    publicKey: s.publicKey,
    latestNotification: s.latestNotification,
    readNotifications: s.readNotifications,
    readonly: s.readonly,
  }));
  const profile = useUserProfile(publicKey);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  async function searchThing() {
    try {
      setSearching(true);
      const link = tryParseNostrLink(search);
      if (link) {
        navigate(`/${link.encode()}`);
        return;
      }
      if (search.includes("@")) {
        const [handle, domain] = search.split("@");
        const pk = await fetchNip05Pubkey(handle, domain);
        if (pk) {
          navigate(`/${new NostrLink(NostrPrefix.PublicKey, pk).encode()}`);
          return;
        }
      }
      navigate(`/search/${encodeURIComponent(search)}`);
    } finally {
      setSearch("");
      setSearching(false);
    }
  }

  const hasNotifications = useMemo(
    () => latestNotification > readNotifications,
    [latestNotification, readNotifications],
  );
  const unreadDms = useMemo(() => (publicKey ? 0 : 0), [publicKey]);

  async function goToNotifications() {
    // request permissions to send notifications
    if ("Notification" in window) {
      try {
        if (Notification.permission !== "granted") {
          const res = await Notification.requestPermission();
          console.debug(res);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (!publicKey) {
    return (
      <button type="button" onClick={() => navigate("/login")}>
        <FormattedMessage {...messages.Login} />
      </button>
    );
  }
  return (
    <div className="header-actions">
      {!location.pathname.startsWith("/search") && (
        <div className="search">
          <input
            type="text"
            placeholder={formatMessage({ defaultMessage: "Search" })}
            className="w-max"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={async e => {
              if (e.key === "Enter") {
                await searchThing();
              }
            }}
          />
          {searching ? (
            <Spinner width={24} height={24} />
          ) : (
            <Icon name="search" size={24} onClick={() => navigate("/search")} />
          )}
        </div>
      )}
      {!readonly && (
        <Link className="btn" to="/messages">
          <Icon name="mail" size={24} />
          {unreadDms > 0 && <span className="has-unread"></span>}
        </Link>
      )}
      <Link className="btn" to="/notifications" onClick={goToNotifications}>
        <Icon name="bell-02" size={24} />
        {hasNotifications && <span className="has-unread"></span>}
      </Link>
      <Avatar
        pubkey={publicKey ?? ""}
        user={profile}
        onClick={() => {
          if (profile) {
            navigate(profileLink(profile.pubkey));
          }
        }}
      />
    </div>
  );
};

function LogoHeader() {
  const { subscriptions } = useLogin();
  const currentSubscription = getCurrentSubscription(subscriptions);

  return (
    <Link to="/" className="logo">
      <h1>{CONFIG.appName}</h1>
      {currentSubscription && (
        <small className="flex">
          <Icon name="diamond" size={10} className="mr5" />
          {mapPlanName(currentSubscription.type)}
        </small>
      )}
    </Link>
  );
}
