// "Our Story": the founder's note on why Welicare exists. The text stays in
// a narrow, readable column with the founder's portrait beside it (stacked
// above the text on phones, see .story-layout in styles.css).
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';

export default function OurStoryPage() {
  return (
    <SiteLayout
      title="Our story"
      description="Why Welicare exists: founder Natasha Mykytiuk on making one-on-one time with people living with dementia more personal and meaningful."
    >
      {/* .hero gives the h1 the same heading style as the Overview page;
          .story-hero drops its two-column grid. */}
      <article className="section story-layout">
        <div className="hero story-hero">
          <h1>Our story</h1>
        </div>

        {/* The caption names her and her role, so the alt text only needs to
            say what the picture shows. */}
        {/* Shown at most ~20rem wide, so the browser picks the 480px or
            960px copy (WebP where supported, JPEG otherwise) instead of the
            1500px original. Not lazy-loaded: it's near the top of the page.
            width/height keep the 3:4 ratio so space is reserved early. */}
        <figure className="founder">
          <picture>
            <source
              type="image/webp"
              srcSet="/founder-480.webp 480w, /founder-960.webp 960w"
              sizes="(max-width: 800px) 16rem, 20rem"
            />
            <img
              src="/founder-960.jpg"
              srcSet="/founder-480.jpg 480w, /founder-960.jpg 960w"
              sizes="(max-width: 800px) 16rem, 20rem"
              alt="Portrait of Natasha Mykytiuk, smiling, in a white shirt"
              width={960}
              height={1280}
              decoding="async"
            />
          </picture>
          <figcaption>
            <strong>Natasha Mykytiuk</strong>
            <span>Founder of Welicare</span>
          </figcaption>
        </figure>

        <div className="story">
          <p className="lead">
            The inspiration for Welicare came from my own personal experiences working with
            mid-to-late-stage dementia patients. I have worked with this population for over four
            years, and have seen firsthand how limited resources and staffing can make it difficult to
            provide meaningful, individualized care.
          </p>
          <p className="lead">
            Generic programming like bingo and word games doesn't do much for a resident who spent 40
            years working on a farm or who lights up at Patsy Cline. Often, the most meaningful details
            that would make a one-on-one session land live in a family member's head or a binder in a
            filing cabinet. Welicare takes this information and puts it somewhere it can actually be
            useful in the moment: on a shared iPad with the resident sitting right there.
          </p>
          <p className="lead">
            Caregiving is unique. In a world increasingly reliant on AI and automation, this job can't
            be handed off. We cannot take the humanity out of caregiving, but we can use tools like AI
            to make caregiving easier.
          </p>
          <p className="story-signoff">— Natasha Mykytiuk, founder</p>
          <Link className="button" to="/">See what Welicare does</Link>
        </div>
      </article>
    </SiteLayout>
  );
}
