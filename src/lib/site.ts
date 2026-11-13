export const SITE = {
  name: "OUTAI",
  title: "OUTAI — Personal Digital Space",
  description: "Explore. Collect. Build. Share. A personal space for technology, AI, the internet and ideas.",
  url: import.meta.env.SITE_URL || "https://outaidage.xyz",
  nav: [
    { label: "文章", href: "/blog/" },
    { label: "书签", href: "/links/" },
    { label: "项目", href: "/projects/" },
    { label: "关于", href: "/about/" },
    { label: "Now", href: "/now/" }
  ]
};
