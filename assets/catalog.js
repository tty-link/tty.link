/* Everything made at tty.link, kept in places around a neighborhood, one for each time you would
 * drop in (bored, curious, worried...). What a thing is built with does not decide its place; that
 * is a tag (Hangul, security, hardware...), so one craft can turn up in more than one place.
 * The home's menu and the /tools/ page read this one list, so adding a service or a tool means
 * adding one entry here.
 *   soon: true   listed but not open yet (shown as "Soon", not linked)
 *   hidden: true kept here but not shown anywhere yet: the menu, /tools/, the counts and the search
 *                all skip it. A place with nothing shown still stands, saying it is coming.
 *   star: true   a place's representative, shown first where room is short
 *   sym          two letters, its short mark on the /tools/ page
 *   tags         what it is built with or about; the /tools/ page finds things by these too */
(() => {
  const d = (en, ko) => ({ en, ko });
  // blurb: when you would come here, said in a few words.
  const CATS = [
    { id: 'playground', en: 'Playground', ko: '놀이터', blurb: d('When you’re bored', '심심할 때') },
    { id: 'studio', en: 'Studio', ko: '화실', blurb: d('When you want to make something', '뭔가 만들고 싶을 때') },
    { id: 'store', en: 'Corner store', ko: '편의점', blurb: d('When work is a chore', '일이 귀찮을 때') },
    { id: 'guardhouse', en: 'Guardhouse', ko: '경비실', blurb: d('When something feels off', '불안할 때') },
    { id: 'classroom', en: 'Classroom', ko: '교실', blurb: d('When you’re curious', '궁금할 때') },
    { id: 'machine-room', en: 'Machine room', ko: '기계실', blurb: d('When your hands itch', '손이 근질거릴 때') },
  ];
  const TAGS = {
    jokes: d('Jokes', '개그'), hangul: d('Hangul', '한글'), security: d('Security', '보안'),
    network: d('Network', '네트워크'), dev: d('Dev', '개발'), hardware: d('Hardware', '하드웨어'),
  };
  // How many jokes LOL has, as LOL's own list counts them: fetched once, when first asked (count()).
  // Until it is known, or if it cannot be had, LOL's line goes without the number.
  let jokes = 0;
  let counting = null;
  const count = (origin = 'https://lol.tty.link') => counting || (counting = fetch(`${origin}/pages/index.json`)
    .then((response) => response.json())
    .then((data) => { jokes = (data.pages || []).length; return jokes; })
    .catch(() => 0));
  const ITEMS = [
    { id: 'lol', cat: 'playground', tags: ['jokes'], sym: 'Lo', star: true, en: 'LOL', ko: 'LOL', url: 'https://lol.tty.link/', host: 'lol.tty.link',
      d: {
        get en() { return `Computer jokes, one at a time.${jokes ? ` ${jokes} so far.` : ''}`; },
        get ko() { return `컴퓨터 개그를 한 편씩.${jokes ? ` 지금까지 ${jokes}편.` : ''}`; },
      } },

    { id: 'font-kku', cat: 'studio', tags: ['hangul'], sym: 'Fk', star: true, en: 'font-kku', ko: '폰꾸', url: 'https://font.tty.link/', host: 'font.tty.link',
      d: d('Draw 8 cells, get all 11,172 Hangul syllables.', '8칸을 그리면 한글 11,172자가 됩니다.') },
    { id: 'font-studio', cat: 'studio', tags: ['hangul'], sym: 'Fs', en: 'Font studio', ko: '글꼴 작업실', url: 'https://font.tty.link/font-studio.html', host: 'font.tty.link',
      d: d('Draw and tune a Hangul font of your own.', '내 한글 글꼴을 그리고 다듬어요.') },
    { id: 'sign', cat: 'studio', tags: ['hangul'], sym: 'Sb', en: 'Sign board', ko: '전광판', url: 'https://font.tty.link/sign.html', host: 'font.tty.link',
      d: d('Type Hangul on any keyboard; it lights up in dots.', '영문 자판으로 친 한글을 도트 전광판에.') },

    { id: 'memo', cat: 'store', tags: ['hangul'], sym: 'Me', en: 'Memo', ko: '메모장', url: 'https://font.tty.link/memo.html', host: 'font.tty.link',
      d: d('Hangul notes on a device with no Hangul at all.', '한글 입력기도 글꼴도 없는 기기의 한글 메모.') },
    { id: 'json', hidden: true, cat: 'store', tags: ['dev'], sym: 'Js', star: true, soon: true, en: 'JSON tidy', ko: 'JSON 정리',
      d: d('Paste messy JSON, get it tidy and checked.', '엉킨 JSON을 붙이면 정리하고 검사해요.') },
    { id: 'regex', hidden: true, cat: 'store', tags: ['dev'], sym: 'Rx', soon: true, en: 'Regex tester', ko: '정규식 맞춰 보기',
      d: d('Watch a pattern match as you type it.', '치는 대로 패턴이 맞는 곳을 보여 줘요.') },
    { id: 'time', hidden: true, cat: 'store', tags: ['dev'], sym: 'Ti', soon: true, en: 'Unix time', ko: '유닉스 시간',
      d: d('Seconds since 1970, to a date and back.', '1970년부터의 초를 날짜로, 날짜를 초로.') },
    { id: 'base64', hidden: true, cat: 'store', tags: ['dev'], sym: 'B6', soon: true, en: 'Base64', ko: 'Base64',
      d: d('Encode and decode, with the bytes shown.', '인코딩·디코딩과 바이트 보기.') },
    { id: 'up', hidden: true, cat: 'store', tags: ['network'], sym: 'Up', soon: true, en: 'Is it up?', ko: '열리나요?',
      d: d('Whether a page answers, and how fast.', '페이지가 응답하는지, 얼마나 빠른지.') },

    { id: 'cert', hidden: true, cat: 'guardhouse', tags: ['security'], sym: 'Ce', star: true, soon: true, en: 'Certificate check', ko: '인증서 확인',
      d: d('When a site’s certificate runs out, and who signed it.', '사이트 인증서가 언제 끝나고 누가 서명했는지.') },
    { id: 'headers', hidden: true, cat: 'guardhouse', tags: ['security'], sym: 'Hd', soon: true, en: 'Header check', ko: '보안 헤더 점검',
      d: d('Which security headers your site sends, and what they do.', '내 사이트가 보내는 보안 헤더와 그 뜻.') },
    { id: 'hash', hidden: true, cat: 'guardhouse', tags: ['security'], sym: 'Ha', soon: true, en: 'Hash', ko: '해시 계산',
      d: d('Hash a file or a line of text, right in the browser.', '파일이나 글의 해시를 브라우저 안에서.') },
    { id: 'password', hidden: true, cat: 'guardhouse', tags: ['security'], sym: 'Pw', soon: true, en: 'Password strength', ko: '비밀번호 강도',
      d: d('How long a password would hold, without sending it anywhere.', '어디에도 보내지 않고 비밀번호가 얼마나 버틸지.') },
    { id: 'lookalike', hidden: true, cat: 'guardhouse', tags: ['security'], sym: 'Lk', soon: true, en: 'Look-alike links', ko: '닮은 주소 구별',
      d: d('Two addresses side by side, letter by letter.', '헷갈리는 두 주소를 글자마다 나란히.') },

    { id: 'dns', hidden: true, cat: 'classroom', tags: ['network'], sym: 'Dn', star: true, soon: true, en: 'Follow DNS', ko: 'DNS 따라가기',
      d: d('How a name becomes an address, one step at a time.', '이름이 주소가 되기까지, 한 단계씩.') },
    { id: 'myip', hidden: true, cat: 'classroom', tags: ['network'], sym: 'Ip', soon: true, en: 'My IP', ko: '내 IP',
      d: d('The address the web sees for you, and where it comes from.', '웹이 보는 내 주소와 그 주소가 어디서 오는지.') },

    { id: 'led-sign', hidden: true, cat: 'machine-room', tags: ['hardware', 'hangul'], sym: 'Ld', star: true, soon: true, en: 'LED sign', ko: 'LED 전광판',
      d: d('The sign board on a real LED panel: parts, wiring and code.', '전광판을 진짜 LED 판으로. 부품, 배선, 코드까지.') },
    { id: 'keycaps', hidden: true, cat: 'machine-room', tags: ['hardware', 'hangul'], sym: 'Kc', soon: true, en: 'Hangul keycaps', ko: '한글 키캡',
      d: d('Hangul you drew, on the keys you type with.', '내가 그린 한글을 내 키보드 위에.') },
  ].filter((item) => !item.hidden);

  // ?many fills every place with numbered placeholders, to see how the menu holds up as the list grows.
  const many = Number(new URLSearchParams(location.search).get('many')) || (new URLSearchParams(location.search).has('many') ? 12 : 0);
  if (many) CATS.forEach((cat) => {
    for (let i = 1; i <= many; i += 1) ITEMS.push({ id: `${cat.id}-${i}`, cat: cat.id, sym: cat.en[0] + i, soon: true, filler: true,
      en: `${cat.en} tool ${i}`, ko: `${cat.ko} 도구 ${i}`, d: d('A placeholder to test a longer list.', '목록이 길어질 때를 보려는 자리.') });
  });

  const UI = {
    en: { made: 'Made at tty.link', all: 'See all', soon: 'Soon', open: 'Open', close: 'Close', back: 'Back to LOL', more: (n) => `+${n} more`,
      count: (n) => `${n}`, search: 'Find a tool', none: 'Nothing by that name yet.', live: 'Open now', items: (n) => (n === 1 ? '1 thing' : `${n} things`),
      free: 'Kept free for what comes next', first: 'Kept free for the first thing' },
    ko: { made: 'tty.link에서 만든 것', all: '전부 보기', soon: '준비 중', open: '열기', close: '닫기', back: 'LOL로 돌아가기', more: (n) => `${n}개 더`,
      count: (n) => `${n}`, search: '도구 찾기', none: '아직 그런 이름은 없어요.', live: '지금 열림', items: (n) => `${n}개`,
      free: '다음 것을 위해 비워 둔 줄', first: '첫 번째 것을 위해 비워 둔 줄' },
  };

  const cats = () => CATS.map((cat) => {
    const items = ITEMS.filter((item) => item.cat === cat.id);
    return { ...cat, items, live: items.filter((item) => !item.soon).length };
  });
  const find = (id) => ITEMS.find((item) => item.id === id);
  const t = (obj, lang) => (obj && typeof obj === 'object' ? obj[lang] || obj.en : obj);
  // A thing's tags as words in both languages, for search.
  const tagWords = (item) => (item.tags || []).flatMap((tag) => [TAGS[tag].en, TAGS[tag].ko]);

  window.TTYCatalog = { CATS, TAGS, ITEMS, UI, cats, find, t, tagWords, count };
})();
