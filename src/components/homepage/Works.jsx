import Projects from "../ui/Projects";
import Heading from "../ui/Heading";

const projectsData = [
  {
    id: 1,
    name: "Kindro",
    type: "UX Research • Product Design • iOS App",
    year: "2023",
    tools: "Figma • User Research • Prototyping • iOS Design",
    img: "/kindro.png",
    alt: "Kindro app design case study",
    slug: "kindro",
    isExternal: false,
    link: null
  },
  {
    id: 2,
    name: "Passion Nails Toronto",
    type: "Web Design • Frontend Development • Branding",
    year: "2024",
    tools: "React • Next.js • TailwindCSS • Figma",
    img: "/passionnails.png",
    alt: "Passion Nails Toronto website mockup",
    slug: null,
    isExternal: true,
    link: "https://passionnailstoronto.vercel.app/"
  },
  {
    id: 3,
    name: "Search a Song",
    type: "Product Engineering • Audio Recognition • Next.js",
    year: "2026",
    tools: "Next.js • AudD • Shazam API • Material Web • Framer Motion",
    img: "/google-song-search.jpg",
    alt: "Google Search a song style Next.js app mockup",
    slug: null,
    isExternal: true,
    link: "https://github.com/VuMadeIt/lucasvu/tree/main/google%20song/google-song-search"
  }
];

export default function Works({ forwardedRef }) {
  return (
    <section
      ref={forwardedRef}
      id="works"
      className="select-none nav-change overflow-hidden min-h-screen py-20 md:py-[12%] bg-secondary-100"
    >
      <div className="max-w-7xl mx-auto px-8">
        <Heading title="Projects" />
        <div className="mt-10 grid grid-cols-1 gap-16 gap-y-16 md:grid-cols-12">
          {projectsData.map((project) => (
            <div key={project.id} className="col-span-1 md:col-span-12">
              <Projects {...project} />
            </div>
          ))}
        </div>
        
        {/* Add some extra spacing to ensure the section is tall enough */}
        <div className="h-32 md:h-48"></div>
      </div>
    </section>
  );
}
