/* Everything made at tty.link, grouped by kind. The home's menu and the /tools/ page read this
 * one list, so adding a service or a tool means adding one entry here.
 *   soon: true   listed but not open yet (shown as "Soon", not linked)
 *   star: true   a category's representative, shown first where room is short
 *   sym          two letters, its short mark on the /tools/ page */
(() => {
  const CATS = [
    { id: 'fun', en: 'Fun', ko: '놀이', blurb: { en: 'Small things that make the day lighter.', ko: '하루를 조금 가볍게 하는 것들.' } },
    { id: 'type', en: 'Type', ko: '글자', blurb: { en: 'Hangul you can draw, type and wear.', ko: '그리고, 치고, 꾸미는 한글.' } },
    { id: 'security', en: 'Security', ko: '보안', blurb: { en: 'Check how safe a site is, and learn why.', ko: '사이트가 얼마나 안전한지 살피고 이유를 배워요.' } },
    { id: 'network', en: 'Network', ko: '네트워크', blurb: { en: 'What happens between here and there.', ko: '여기서 저기까지 무슨 일이 생기는지.' } },
    { id: 'dev', en: 'Dev', ko: '개발', blurb: { en: 'Little helpers for everyday code.', ko: '매일 쓰는 코드의 작은 도우미.' } },
  ];
  const d = (en, ko) => ({ en, ko });
  const ITEMS = [
    { id: 'lol', cat: 'fun', sym: 'Lo', star: true, en: 'LOL', ko: 'LOL', url: 'https://lol.tty.link/', host: 'lol.tty.link',
      d: d('Computer jokes, one at a time. 48 so far.', '컴퓨터 개그를 한 편씩. 지금까지 48편.') },
    { id: 'font-kku', cat: 'type', sym: 'Fk', star: true, en: 'font-kku', ko: '폰꾸', url: 'https://font.tty.link/', host: 'font.tty.link',
      d: d('Draw 8 cells, get all 11,172 Hangul syllables.', '8칸을 그리면 한글 11,172자가 됩니다.') },
    { id: 'font-studio', cat: 'type', sym: 'Fs', en: 'Font studio', ko: '글꼴 작업실', url: 'https://font.tty.link/font-studio.html', host: 'font.tty.link',
      d: d('Draw and tune a Hangul font of your own.', '내 한글 글꼴을 그리고 다듬어요.') },
    { id: 'sign', cat: 'type', sym: 'Sb', en: 'Sign board', ko: '전광판', url: 'https://font.tty.link/sign.html', host: 'font.tty.link',
      d: d('Type Hangul on any keyboard; it lights up in dots.', '영문 자판으로 친 한글을 도트 전광판에.') },
    { id: 'memo', cat: 'type', sym: 'Me', en: 'Memo', ko: '메모장', url: 'https://font.tty.link/memo.html', host: 'font.tty.link',
      d: d('Hangul notes on a device with no Hangul at all.', '한글 입력기도 글꼴도 없는 기기의 한글 메모.') },
    { id: 'cert', cat: 'security', sym: 'Ce', star: true, soon: true, en: 'Certificate check', ko: '인증서 확인',
      d: d('When a site’s certificate runs out, and who signed it.', '사이트 인증서가 언제 끝나고 누가 서명했는지.') },
    { id: 'headers', cat: 'security', sym: 'Hd', soon: true, en: 'Header check', ko: '보안 헤더 점검',
      d: d('Which security headers your site sends, and what they do.', '내 사이트가 보내는 보안 헤더와 그 뜻.') },
    { id: 'hash', cat: 'security', sym: 'Ha', soon: true, en: 'Hash', ko: '해시 계산',
      d: d('Hash a file or a line of text, right in the browser.', '파일이나 글의 해시를 브라우저 안에서.') },
    { id: 'password', cat: 'security', sym: 'Pw', soon: true, en: 'Password strength', ko: '비밀번호 강도',
      d: d('How long a password would hold, without sending it anywhere.', '어디에도 보내지 않고 비밀번호가 얼마나 버틸지.') },
    { id: 'lookalike', cat: 'security', sym: 'Lk', soon: true, en: 'Look-alike links', ko: '닮은 주소 구별',
      d: d('Two addresses side by side, letter by letter.', '헷갈리는 두 주소를 글자마다 나란히.') },
    { id: 'dns', cat: 'network', sym: 'Dn', star: true, soon: true, en: 'DNS lookup', ko: 'DNS 조회',
      d: d('What a name points to, record by record.', '이름이 가리키는 곳을 레코드별로.') },
    { id: 'myip', cat: 'network', sym: 'Ip', soon: true, en: 'My IP', ko: '내 IP',
      d: d('The address the web sees for you.', '웹이 보는 내 주소.') },
    { id: 'up', cat: 'network', sym: 'Up', soon: true, en: 'Is it up?', ko: '열리나요?',
      d: d('Whether a page answers, and how fast.', '페이지가 응답하는지, 얼마나 빠른지.') },
    { id: 'json', cat: 'dev', sym: 'Js', star: true, soon: true, en: 'JSON tidy', ko: 'JSON 정리',
      d: d('Paste messy JSON, get it tidy and checked.', '엉킨 JSON을 붙이면 정리하고 검사해요.') },
    { id: 'regex', cat: 'dev', sym: 'Rx', soon: true, en: 'Regex playground', ko: '정규식 놀이터',
      d: d('Watch a pattern match as you type it.', '치는 대로 패턴이 맞는 곳을 보여 줘요.') },
    { id: 'time', cat: 'dev', sym: 'Ti', soon: true, en: 'Unix time', ko: '유닉스 시간',
      d: d('Seconds since 1970, to a date and back.', '1970년부터의 초를 날짜로, 날짜를 초로.') },
    { id: 'base64', cat: 'dev', sym: 'B6', soon: true, en: 'Base64', ko: 'Base64',
      d: d('Encode and decode, with the bytes shown.', '인코딩·디코딩과 바이트 보기.') },
  ];

  // ?many fills every category with numbered placeholders, to see how the menu holds up as the list grows.
  const many = Number(new URLSearchParams(location.search).get('many')) || (new URLSearchParams(location.search).has('many') ? 12 : 0);
  if (many) CATS.forEach((cat) => {
    for (let i = 1; i <= many; i += 1) ITEMS.push({ id: `${cat.id}-${i}`, cat: cat.id, sym: cat.en[0] + i, soon: true, filler: true,
      en: `${cat.en} tool ${i}`, ko: `${cat.ko} 도구 ${i}`, d: d('A placeholder to test a longer list.', '목록이 길어질 때를 보려는 자리.') });
  });

  const UI = {
    en: { made: 'Made at tty.link', all: 'See all', soon: 'Soon', open: 'Open', close: 'Close', back: 'Back to LOL', more: (n) => `+${n} more`,
      count: (n) => `${n}`, search: 'Find a tool', none: 'Nothing by that name yet.', live: 'Open now', items: (n) => (n === 1 ? '1 thing' : `${n} things`) },
    ko: { made: 'tty.link에서 만든 것', all: '전부 보기', soon: '준비 중', open: '열기', close: '닫기', back: 'LOL로 돌아가기', more: (n) => `${n}개 더`,
      count: (n) => `${n}`, search: '도구 찾기', none: '아직 그런 이름은 없어요.', live: '지금 열림', items: (n) => `${n}개` },
  };

  const cats = () => CATS.map((cat) => {
    const items = ITEMS.filter((item) => item.cat === cat.id);
    return { ...cat, items, live: items.filter((item) => !item.soon).length };
  });
  const find = (id) => ITEMS.find((item) => item.id === id);
  const t = (obj, lang) => (obj && typeof obj === 'object' ? obj[lang] || obj.en : obj);

  window.TTYCatalog = { CATS, ITEMS, UI, cats, find, t };
})();
