import { useEffect, useMemo, useRef } from 'react';
import { FlatList, View } from 'react-native';

// How long scrolling must be still before a swipe counts as finished (web).
const SETTLE_MS = 120;

// A sideways, one-page-at-a-time swiper that follows your finger and loops
// continuously: swiping past the last item carries on to the first, and
// back from the first to the last. Used by the Resident Mode photo album
// (ResidentPhotoAlbumScreen) and its full-screen viewer (PhotoViewerModal).
//
// Controlled: `index` is the item showing, and `onIndexChange` reports a
// swipe that landed somewhere new. Changing `index` from outside (the
// album's big prev/next buttons) slides to that item.
//
// Looping uses the usual trick: the pages are
//   [copy of last, ...items, copy of first]
// and when a swipe settles on one of the copies, the list jumps (without
// animation) to the real item it shows, which looks identical. With a
// single item there's nothing to loop, so no copies are added.
//
// Props:
//   items          — array of { id, ... }
//   index / onIndexChange
//   width / height — the page size (the pager fills exactly this)
//   renderItem(item) — one page's content
//   testID
export default function LoopingPager({
  items,
  index,
  onIndexChange,
  width,
  height,
  renderItem,
  testID,
}) {
  const listRef = useRef(null);
  const looping = items.length > 1;

  const pages = useMemo(() => {
    if (!looping) return items.map((it) => ({ key: it.id, item: it }));
    const last = items[items.length - 1];
    return [
      { key: `copy-start-${last.id}`, item: last },
      ...items.map((it) => ({ key: it.id, item: it })),
      { key: `copy-end-${items[0].id}`, item: items[0] },
    ];
  }, [items, looping]);

  // Item index → its real page, and any page → the item it shows.
  const pageOf = (i) => (looping ? i + 1 : i);
  const itemOf = (page) => (looping ? (page - 1 + items.length) % items.length : page);

  // The page currently scrolled to, and the index/width it was last synced
  // with — to tell a swipe we already reported apart from an outside change.
  const shownPage = useRef(pageOf(index));
  const lastIndex = useRef(index);
  const lastWidth = useRef(width);

  function scrollToPage(page, animated) {
    shownPage.current = page;
    listRef.current?.scrollToIndex?.({ index: page, animated });
  }

  // Follow outside changes to `index` (prev/next buttons), and rotation.
  useEffect(() => {
    if (!items.length) return;
    const rotated = lastWidth.current !== width;
    const prev = lastIndex.current;
    lastIndex.current = index;
    lastWidth.current = width;
    if (rotated) {
      scrollToPage(pageOf(index), false);
      return;
    }
    if (itemOf(shownPage.current) === index) return; // a swipe we reported
    // Stepping round the ends slides onto the copy (then settle() hops to
    // the real page), so "next" from the last photo moves forward to the
    // first rather than rewinding through the whole album.
    if (looping && prev === items.length - 1 && index === 0) scrollToPage(items.length + 1, true);
    else if (looping && prev === 0 && index === items.length - 1) scrollToPage(0, true);
    else scrollToPage(pageOf(index), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, width, items.length]);

  // A swipe (or slide) settled at offset `x`: hop off a copy onto the real
  // page, and report where we landed.
  function settle(x) {
    if (!width) return;
    const page = Math.round(x / width);
    if (page < 0 || page >= pages.length) return;
    shownPage.current = page;
    const itemIndex = itemOf(page);
    if (page !== pageOf(itemIndex)) scrollToPage(pageOf(itemIndex), false);
    if (itemIndex !== lastIndex.current) {
      lastIndex.current = itemIndex;
      onIndexChange(itemIndex);
    }
  }

  // When has a swipe finished? Phones fire onMomentumScrollEnd; the web
  // build never does. So every scroll event also restarts a short timer,
  // and once scrolling has been still for SETTLE_MS on (or very near) a
  // page boundary, that counts as settled. Settling twice is harmless.
  const settleTimer = useRef(null);
  function onScroll(e) {
    const x = e.nativeEvent.contentOffset.x;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      // Mid-snap the offset isn't on a page yet; wait for the next event.
      if (Math.abs(x / width - Math.round(x / width)) < 0.02) settle(x);
    }, SETTLE_MS);
  }
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  return (
    <FlatList
      ref={listRef}
      testID={testID}
      // Re-created on rotation/resize so every page is exactly one page wide.
      key={`pager-${width}`}
      data={pages}
      keyExtractor={(page) => page.key}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={Math.min(pageOf(index), Math.max(pages.length - 1, 0))}
      getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // Only the page on screen and its neighbours need to exist.
      windowSize={3}
      initialNumToRender={3}
      renderItem={({ item: page }) => (
        <View style={{ width, height }}>{renderItem(page.item)}</View>
      )}
    />
  );
}
