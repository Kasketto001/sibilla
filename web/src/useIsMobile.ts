import { useEffect, useState } from "react";

// Below this the three columns (conversations, interface, chat) no longer fit side by side.
const QUERY = "(max-width: 1023px)";

/** True on phones and narrow windows, where the sidebar and the chat can't sit beside the interface. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof matchMedia === "function" && matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
