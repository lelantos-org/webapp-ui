// Vendor token and network artwork, inlined.
//
// Extracted from `@web3icons/core` (MIT) and committed rather than depended on:
// the package ships 77 MB of SVG for 5,364 assets, of which this deployment
// needs eleven. Inline JSX rather than `.svg` files because a file import is a
// subresource, and Vite only inlines one below `assetsInlineLimit` (4 KB) —
// a logo that creeps past it would silently become a network request, which is
// the one thing this layer must never do. See `registry.ts` for why.
//
// The marks are the trademarks of their respective projects, reproduced to
// identify the assets a user holds. Nothing here is our own branding.
//
// Regenerating: pull `@web3icons/core`, take `dist/svgs/{tokens,networks}/branded/`,
// drop `class`/`xmlns`/`width`/`height`, and camel-case the hyphenated
// attributes. Keep the 24x24 viewBox — the CSS sizes the box, not the artwork.

import type { ReactElement } from "react";

// `aria-hidden="true"` on every mark, not a `<title>`: the symbol or chain name
// is always rendered as text beside it, so a title would make a screen reader
// read each asset twice. `focusable="false"` keeps IE-era SVG out of the tab
// order. Spelled out rather than shorthand because biome's `noSvgWithoutTitle`
// only recognises the explicit form.

/// Token artwork by uppercased symbol. WETH shares ether's mark: it is ether.
export const TOKEN_ART: Readonly<Record<string, ReactElement>> = {
  ETH: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path fill="#8FFCF3" d="M12 3v6.65l5.625 2.516z" />
      <path fill="#CABCF8" d="m12 3-5.625 9.166L12 9.651z" />
      <path fill="#CBA7F5" d="M12 16.477v4.522l5.625-7.784z" />
      <path fill="#74A0F3" d="M12 21v-4.523l-5.625-3.262z" />
      <path fill="#CBA7F5" d="m12 15.43 5.625-3.263L12 9.65z" />
      <path fill="#74A0F3" d="M6.375 12.167 12 15.429V9.651z" />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="m12 15.429-5.625-3.263L12 3l5.625 9.166zM6.749 11.9l5.16-8.41v6.115zm-.077.23 5.238-2.327v5.364zm5.418-2.327v5.364l5.233-3.038zm0-.198 5.16 2.295-5.16-8.41z"
        clipRule="evenodd"
      />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="M12 16.406 6.375 13.21 12 21l5.625-7.79zm-4.995-2.633 4.905 2.79v4.005zm5.085 2.79v4.005l4.905-6.795z"
        clipRule="evenodd"
      />
    </svg>
  ),
  USDC: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path fill="#0B53BF" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18" />
      <path
        fill="#fff"
        d="M13.62 5.45v1.159a5.64 5.64 0 0 1 4.005 5.394 5.64 5.64 0 0 1-4.005 5.394v1.16a6.74 6.74 0 0 0 5.13-6.554 6.74 6.74 0 0 0-5.13-6.553m-7.245 6.553a5.64 5.64 0 0 1 4.005-5.394V5.45a6.74 6.74 0 0 0-5.13 6.553 6.74 6.74 0 0 0 5.13 6.553v-1.159a5.63 5.63 0 0 1-4.005-5.394"
      />
      <path
        fill="#fff"
        d="M14.419 13.258c0-2.301-3.606-1.356-3.606-2.627 0-.456.366-.748 1.063-.748.833 0 1.12.405 1.21.95h1.147c-.102-1.024-.69-1.67-1.67-1.863v-.904h-1.125v.872c-1.075.137-1.75.762-1.75 1.693 0 2.312 3.611 1.445 3.611 2.694 0 .472-.455.787-1.226.787-1.007 0-1.339-.444-1.462-1.057H9.49c.073 1.122.764 1.823 1.947 1.999v.886h1.125v-.875c1.153-.149 1.856-.82 1.856-1.807"
      />
    </svg>
  ),
  USDT: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#009393"
        d="m12 19.2-9-8.88L6.433 4.8h11.134L21 10.32zm.9-8.1v-1.098c1.62.08 3.132.396 3.6.805-.544.477-2.493.824-4.5.824s-3.956-.347-4.5-.824c.463-.41 1.98-.72 3.6-.81V11.1zm-5.4-.297v.661c.463.41 1.975.72 3.6.81V14.7h1.8v-2.43c1.62-.081 3.136-.396 3.6-.806v-1.318c-.464-.41-1.98-.725-3.6-.81V8.4h2.7V7.05H8.4V8.4h2.7v.936c-1.625.085-3.137.4-3.6.81z"
      />
    </svg>
  ),
  DAI: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#FDC134"
        fillRule="evenodd"
        d="M11.675 3.871H4.742v5.226H3v2.323h1.742v1.16H3v2.323h1.742v5.226h6.933a8.17 8.17 0 0 0 7.63-5.226H21v-2.322h-1.185a8 8 0 0 0 0-1.162H21V9.098h-1.695a8.18 8.18 0 0 0-7.63-5.226m5.806 8.71q.06-.58 0-1.162H7.065v1.162h10.422zM7.065 14.904v2.903h4.482c2.207 0 4.14-1.167 5.168-2.903zm0-5.807h9.656a6 6 0 0 0-5.168-2.903H7.065z"
        clipRule="evenodd"
      />
    </svg>
  ),
  WBTC: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#fff"
        d="m17.678 6.798-.495.493a6.95 6.95 0 0 1 0 9.407l.495.492a7.65 7.65 0 0 0 0-10.403zM7.282 6.84a7.015 7.015 0 0 1 9.444 0l.494-.493a7.72 7.72 0 0 0-10.443 0zm-.46 9.862a6.95 6.95 0 0 1 0-9.403l-.495-.492a7.65 7.65 0 0 0 0 10.404zm9.899.455a7.015 7.015 0 0 1-9.444 0l-.494.492a7.72 7.72 0 0 0 10.443 0zm-3.315-6.562c0 .634-.563.843-1.125.843h-.844V9.752h1.125c.43 0 .844.315.844.844m.495 2.845c0 .692-.776.81-1.339.81h-1.125v-1.687h1.125c.504 0 1.339.204 1.339.877m1.219-3.082c-.1-1.027-.87-1.627-1.995-1.732V6.938h-1.126v1.68c-.228 0-.326 0-.558.008V6.938h-1.129v1.688H8.625v1.125h.63c.213 0 .494 0 .494.446v3.767c0 .006 0 .287-.326.287h-.626l-.172 1.125h1.687v1.688h1.125l-.006-1.688H12v1.688h1.125v-1.688c1.469-.089 2.368-.394 2.496-1.765.103-1.103-.417-1.595-1.249-1.794.506-.256.823-.707.748-1.459"
      />
      <path
        fill="#fff"
        d="M11.998 3.733C7.418 3.735 3.708 7.437 3.71 12c.003 4.563 3.718 8.26 8.298 8.258 4.577-.003 8.287-3.7 8.288-8.26-.005-4.562-3.718-8.263-8.298-8.265m0 17.233c-4.97 0-9-4.015-8.998-8.968.001-4.952 4.03-8.966 9.002-8.965 4.969.001 8.997 4.014 8.998 8.965-.006 4.95-4.033 8.963-9.002 8.968"
      />
    </svg>
  ),
};

/// Network artwork by the key `registry.ts` maps a chain id to.
export const CHAIN_ART: Readonly<Record<string, ReactElement>> = {
  ethereum: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path fill="#8FFCF3" d="M12 3v6.651l5.625 2.516z" />
      <path fill="#CABCF8" d="m12 3-5.625 9.166L12 9.653z" />
      <path fill="#CBA7F5" d="M12 16.478V21l5.625-7.784z" />
      <path fill="#74A0F3" d="M12 21v-4.522l-5.625-3.262z" />
      <path fill="#CBA7F5" d="m12 15.43 5.625-3.263L12 9.652z" />
      <path fill="#74A0F3" d="M6.375 12.167 12 15.43V9.652z" />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="m12 15.43-5.625-3.263L12 3l5.624 9.166zm-5.252-3.528 5.161-8.41v6.114zm-.077.229 5.238-2.327v5.364zm5.418-2.327v5.364l5.234-3.037zm0-.198 5.161 2.296-5.161-8.41z"
        clipRule="evenodd"
      />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="m12 16.406-5.625-3.195L12 21l5.624-7.79zm-4.995-2.633 4.904 2.79v4.005zm5.084 2.79v4.005l4.905-6.795z"
        clipRule="evenodd"
      />
    </svg>
  ),
  optimism: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#FE0420"
        fillRule="evenodd"
        d="M3.966 15.8q.979.7 2.512.7 1.854 0 2.962-.838 1.108-.85 1.559-2.562.27-1.05.464-2.163.063-.398.064-.663 0-.874-.451-1.499a2.7 2.7 0 0 0-1.237-.95Q9.053 7.5 8.062 7.5q-3.644 0-4.52 3.437a40 40 0 0 0-.477 2.163q-.058.335-.065.674 0 1.314.966 2.026m4.65-2.775c-.247.957-.926 1.58-1.958 1.58-1.02 0-1.368-.69-1.184-1.58a27 27 0 0 1 .464-2.05c.265-1.034.89-1.58 1.956-1.58 1.017 0 1.348.68 1.173 1.58a30 30 0 0 1-.451 2.05m3.902 3.385q.076.09.214.089h1.704a.38.38 0 0 0 .238-.089.36.36 0 0 0 .138-.232l.538-2.52h1.733c1.094 0 1.95-.53 2.576-1.002q.953-.707 1.266-2.186.075-.348.075-.67 0-1.117-.851-1.71-.84-.591-2.23-.591h-3.333a.38.38 0 0 0-.238.09.38.38 0 0 0-.138.232l-1.73 8.356a.3.3 0 0 0 .038.232m6.09-5.966c-.157.689-.757 1.319-1.462 1.319h-1.44l.496-2.369h1.503c.512 0 .94.102.94.665q0 .165-.037.385"
        clipRule="evenodd"
      />
    </svg>
  ),
  polygon: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="url(#polygon__a)"
        d="m16.364 15.217 4.27-2.435a.73.73 0 0 0 .366-.627V7.284a.72.72 0 0 0-.366-.627l-4.27-2.435a.74.74 0 0 0-.732 0l-4.27 2.435a.72.72 0 0 0-.366.627v8.704l-2.994 1.707-2.994-1.707v-3.415l2.994-1.707 1.974 1.127V9.702l-1.608-.918a.75.75 0 0 0-.732 0l-4.27 2.435a.72.72 0 0 0-.366.627v4.87c0 .258.14.498.366.627l4.27 2.436a.75.75 0 0 0 .732 0l4.27-2.436a.72.72 0 0 0 .366-.626V8.012l.053-.03 2.94-1.677 2.994 1.707v3.415l-2.994 1.707-1.972-1.124v2.291l1.606.916a.75.75 0 0 0 .732 0z"
      />
      <defs>
        <linearGradient
          id="polygon__a"
          x1="2.942"
          x2="20.119"
          y1="17.194"
          y2="7.101"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A726C1" />
          <stop offset=".88" stopColor="#803BDF" />
          <stop offset="1" stopColor="#7B3FE4" />
        </linearGradient>
      </defs>
    </svg>
  ),
  base: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#00F"
        d="M3 4.706c0-.585 0-.877.11-1.101.106-.215.28-.39.496-.495C3.83 3 4.122 3 4.706 3h14.588c.585 0 .876 0 1.101.11.215.105.389.28.494.495.111.225.111.517.111 1.101v14.588c0 .585 0 .876-.11 1.101-.106.215-.28.389-.495.494-.225.111-.517.111-1.101.111H4.706c-.585 0-.876 0-1.101-.11a1.08 1.08 0 0 1-.494-.495C3 20.17 3 19.878 3 19.294z"
      />
    </svg>
  ),
  arbitrum: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#213147"
        d="M4.515 8.471v7.056c0 .45.245.867.64 1.092l6.205 3.529a1.3 1.3 0 0 0 1.28 0l6.203-3.53c.396-.224.64-.64.64-1.09V8.47c0-.45-.244-.867-.64-1.091L12.64 3.85a1.3 1.3 0 0 0-1.28 0L5.155 7.38a1.25 1.25 0 0 0-.639 1.091"
      />
      <path
        fill="#12AAFF"
        d="m13.353 13.368-.885 2.39a.3.3 0 0 0 0 .205l1.523 4.112 1.76-1.001-2.113-5.706a.152.152 0 0 0-.285 0m1.774-4.019a.152.152 0 0 0-.285 0l-.885 2.39a.3.3 0 0 0 0 .205l2.494 6.732 1.761-1.001z"
      />
      <path
        fill="#9DCCED"
        d="M11.998 4.115a.3.3 0 0 1 .126.033l6.715 3.818a.25.25 0 0 1 .126.214v7.635c0 .089-.048.17-.126.214l-6.715 3.819a.25.25 0 0 1-.126.032.3.3 0 0 1-.125-.032l-6.715-3.815a.25.25 0 0 1-.126-.215V8.182c0-.089.048-.17.126-.215l6.715-3.818a.26.26 0 0 1 .125-.034m0-1.115c-.238 0-.478.06-.692.183L4.593 7A1.36 1.36 0 0 0 3.9 8.182v7.635c0 .487.264.938.693 1.181l6.714 3.819a1.41 1.41 0 0 0 1.386 0l6.714-3.818a1.36 1.36 0 0 0 .693-1.182V8.182A1.36 1.36 0 0 0 19.407 7l-6.716-3.817A1.4 1.4 0 0 0 11.998 3"
      />
      <path fill="#213147" d="m7.559 18.685.617-1.666 1.244 1.018-1.163 1.046z" />
      <path
        fill="#fff"
        d="M11.433 7.635H9.731a.3.3 0 0 0-.285.197l-3.649 9.852 1.761 1.001 4.018-10.849a.15.15 0 0 0-.143-.2m2.979-.001h-1.703a.3.3 0 0 0-.284.197l-4.167 11.25 1.761 1 4.535-12.246a.15.15 0 0 0-.142-.2"
      />
    </svg>
  ),
  avalanche: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        fill="#E84142"
        d="M7.515 19.874H4.492c-.637 0-.952 0-1.142-.118A.75.75 0 0 1 3 19.16c-.011-.224.146-.495.461-1.04l7.47-12.982c.32-.551.484-.827.687-.928a.76.76 0 0 1 .697 0c.202.101.36.377.675.928l1.542 2.643.005.012c.253.374.454.781.596 1.209.085.337.085.703 0 1.046a5 5 0 0 1-.596 1.22l-3.926 6.84-.011.023c-.201.408-.46.788-.766 1.125a2.36 2.36 0 0 1-.927.534c-.32.084-.675.084-1.39.084m7.645 0h4.33c.648 0 .968 0 1.16-.123a.75.75 0 0 0 .347-.596c.012-.22-.14-.478-.443-.991l-.034-.055-2.171-3.657-.023-.044c-.304-.507-.461-.765-.658-.866a.75.75 0 0 0-.692 0c-.202.1-.36.371-.675.91l-2.172 3.662v.012c-.32.538-.477.81-.466 1.029a.76.76 0 0 0 .348.601c.187.118.507.118 1.149.118"
      />
    </svg>
  ),
};
