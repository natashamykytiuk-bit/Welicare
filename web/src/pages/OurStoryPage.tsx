// "Our Story": the founder's note on why Welicare exists. Plain text in a
// narrow, readable column.
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';

export default function OurStoryPage() {
  return (
    <SiteLayout>
      {/* .hero gives the h1 the same heading style as the Overview page;
          .story overrides its two-column grid with a single text column. */}
      <article className="section story">
        <div className="hero story-hero">
          <h1>Our story</h1>
        </div>
        <p className="lead">
          The inspiration for Welicare came from my own personal experiences working with
          mid-to-late-stage dementia patients. I have worked with this population for over four
          years, and have seen firsthand how limited resources and staffing can make it difficult to
          provide meaningful, individualized care. Generic programming like bingo and word games doesn't do much for a resident who spent 40
          years working on a farm or who lights up at Patsy Cline. Often, the most meaningful details
          that would make a one-on-one session land live in a family member's head or a binder in a
          filing cabinet. Welicare takes this information and puts it somewhere it can actually be useful in the
          moment: on a shared iPad with the resident sitting right there.
        </p>
        <p className="lead">
          Caregiving is unique. In a world increasingly reliant on AI and automation, this job can't
          be handed off. We cannot take the humanity out of caregiving, but we can use tools like AI
          to make caregiving easier.
        </p>
        <p className="story-signoff">— Natasha Mykytiuk, founder</p>
        <Link className="button" to="/">See what Welicare does</Link>
      </article>
    </SiteLayout>
  );
}
