/** Pure, illustrative interval logic. Not the SGR-IT backend. */
function parseTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Adjacent bookings are allowed: intervals are half-open [start, end). */
function getAvailability(startValue, endValue, bookings = [[600, 660]]) {
  const start = parseTime(startValue);
  const end = parseTime(endValue);
  if (start === null || end === null || end <= start) return { status: 'invalid', start, end };
  if (!Array.isArray(bookings) || bookings.some(b => !Array.isArray(b) || b.length !== 2 || !b.every(Number.isFinite) || b[0] >= b[1])) {
    throw new TypeError('Bookings must contain valid numeric intervals.');
  }
  const conflict = bookings.some(([bookedStart, bookedEnd]) => start < bookedEnd && end > bookedStart);
  return { status: conflict ? 'conflict' : 'available', start, end };
}

/** MC.03 interactions. The HTML remains the primary experience. */
const root = document.documentElement;
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key,value) { try { localStorage.setItem(key,value); } catch { /* Private browsing is supported. */ } }
};
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = false;
let motionPreference = storage.get('mc-motion');
function updateMotion() {
  reduced = motionQuery.matches || motionPreference === 'reduce';
  root.classList.toggle('reduce-motion', reduced);
  root.classList.toggle('motion-allowed', !reduced);
  for (const button of document.querySelectorAll('[data-motion-toggle]')) {
    button.setAttribute('aria-pressed', String(reduced));
    button.disabled = motionQuery.matches;
    button.querySelector('span').textContent = reduced ? button.dataset.on : button.dataset.off;
  }
  if (reduced) document.querySelectorAll('.reveal-pending').forEach(el => el.classList.remove('reveal-pending'));
}
function initLanguage() {
  const base = document.body.dataset.base || '/';
  if (document.body.hasAttribute('data-entry-root')) {
    const chosen = storage.get('mc-language');
    if (chosen === 'en' || chosen === 'es') {
      location.replace('./' + chosen + '/index.html' + location.hash);
      return;
    }
  }
  document.querySelectorAll('[data-language]').forEach(a => {
    if (location.hash && document.body.dataset.page === 'home') {
      const url = new URL(a.href);
      url.hash = location.hash;
      a.href = url.href;
    }
    a.addEventListener('click', () => storage.set('mc-language', a.dataset.language));
  });
}
function initDialogs() {
  const dialogs = new Map(Array.from(document.querySelectorAll('dialog')).map(d => [d.id.replace('-dialog',''),d]));
  let returnFocus = null;
  let restoreFocus = true;
  const command = dialogs.get('command');
  const input = document.getElementById('command-input');
  const entries = [...document.querySelectorAll('[data-search-item]')];
  const empty = document.querySelector('.command-empty');
  const normalise = s => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const filter = () => {
    const query = normalise(input.value.trim());
    let count = 0;
    for (const entry of entries) {
      const match = normalise(entry.dataset.searchText).includes(query);
      entry.hidden = !match;
      if (match) count++;
    }
    empty.hidden = count > 0;
  };
  function open(name,trigger=document.activeElement) {
    const dialog=dialogs.get(name);
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (dialog.open) return;
    returnFocus=trigger;
    restoreFocus=true;
    if (name==='command') { input.value=''; filter(); }
    dialog.showModal();
    document.body.classList.add('has-dialog');
    if (name==='command') input.focus();
    else dialog.querySelector('[data-close]')?.focus();
  }
  for (const trigger of document.querySelectorAll('[data-open]')) {
    trigger.addEventListener('click', () => open(trigger.dataset.open,trigger));
  }
  for (const dialog of dialogs.values()) {
    dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click',() => dialog.close()));
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const r=dialog.getBoundingClientRect();
        if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();
      }
      const link=event.target.closest('a[href]');
      if (link) {
        restoreFocus=false;
        dialog.close();
        const url=new URL(link.href);
        if (url.pathname===location.pathname && url.hash) {
          const target=document.getElementById(decodeURIComponent(url.hash.slice(1)));
          if (target) {
            target.setAttribute('tabindex','-1');
            requestAnimationFrame(()=>target.focus({preventScroll:true}));
            target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});
          }
        }
      }
    });
    dialog.addEventListener('close',()=>{
      if (![...dialogs.values()].some(d=>d.open)) document.body.classList.remove('has-dialog');
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    });
  }
  input.addEventListener('input',filter);
  command.addEventListener('keydown',event=>{
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if (['Home','End'].includes(event.key) && event.target===input) return;
    const visible=entries.filter(e=>!e.hidden).map(e=>e.querySelector('a'));
    if (!visible.length) return;
    let i=visible.indexOf(document.activeElement);
    if (event.key==='ArrowDown') i=(i+1)%visible.length;
    if (event.key==='ArrowUp') i=i<=0?visible.length-1:i-1;
    if (event.key==='Home') i=0;
    if (event.key==='End') i=visible.length-1;
    event.preventDefault();
    visible[i].focus();
  });
  document.addEventListener('keydown',event=>{
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='k') {
      event.preventDefault();
      if (command.open) command.close();
      else if (![...dialogs.values()].some(d=>d.open)) open('command');
    }
  });
}
function initDisciplines() {
  const items=[...document.querySelectorAll('[data-discipline]')];
  const map=document.querySelector('[data-system-map]');
  if (!map) return;
  items.forEach(item=>item.addEventListener('toggle',()=>{
    if (item.open) {
      for (const other of items) if (other!==item && other.open) other.open=false;
      map.dataset.active=item.dataset.discipline;
    } else if (!items.some(x=>x.open)) map.dataset.active='';
  }));
}
function initScroll() {
  const sections=[...document.querySelectorAll('[data-nav-section]')];
  const navLinks=[...document.querySelectorAll('[data-nav-link]')];
  const caseLinks=[...document.querySelectorAll('[data-case-nav]')];
  const caseSections=caseLinks.map(a=>document.getElementById(a.dataset.caseNav)).filter(Boolean);
  let scheduled=false;
  const currentOf = entries => {
    let id='';
    for (const section of entries) {
      if (section.getBoundingClientRect().top < innerHeight * .42) id=section.id;
    }
    return id;
  };
  const frame=()=>{
    scheduled=false;
    const range=Math.max(1,root.scrollHeight-innerHeight);
    root.style.setProperty('--read-progress',String(Math.min(1,Math.max(0,scrollY/range))));
    const active=currentOf(sections);
    navLinks.forEach(a=>{
      const selected=a.dataset.navLink===active;
      a.classList.toggle('is-active',selected);
      if (selected) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
    });
    const caseActive=currentOf(caseSections) || caseSections[0]?.id;
    caseLinks.forEach(a=>{
      const selected=a.dataset.caseNav===caseActive;
      a.classList.toggle('is-active',selected);
      if (selected) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
    });
  };
  const schedule=()=>{if (!scheduled) {scheduled=true;requestAnimationFrame(frame);}};
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  frame();
}
function initVisuals() {
  if ('IntersectionObserver' in window) {
    const visibility=new IntersectionObserver(entries=>{
      entries.forEach(e=>e.target.classList.toggle('is-visible',e.isIntersecting));
    },{rootMargin:'60px'});
    document.querySelectorAll('.hero-art,.feature-card,.case-cover').forEach(el=>visibility.observe(el));
    if (!reduced) {
      const reveal=new IntersectionObserver(entries=>{
        for (const e of entries) if (e.isIntersecting) {
          e.target.classList.remove('reveal-pending');
          reveal.unobserve(e.target);
        }
      },{rootMargin:'0px 0px -15px 0px',threshold:0});
      document.querySelectorAll('[data-reveal]').forEach(el=>{
        if (el.getBoundingClientRect().top>innerHeight) {
          el.classList.add('reveal-pending');
          reveal.observe(el);
        }
      });
    }
  }
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-parallax]').forEach(el=>{
      let raf=0;
      el.addEventListener('pointermove',e=>{
        if (reduced) return;
        cancelAnimationFrame(raf);
        const bounds=el.getBoundingClientRect();
        const x=(e.clientX-bounds.left)/bounds.width-.5;
        const y=(e.clientY-bounds.top)/bounds.height-.5;
        raf=requestAnimationFrame(()=>{
          el.style.setProperty('--px',`${x*14}px`);
          el.style.setProperty('--py',`${y*10}px`);
          el.style.setProperty('--pr',`${x*.8}deg`);
        });
      },{passive:true});
      el.addEventListener('pointerleave',()=>{
        cancelAnimationFrame(raf);
        el.style.setProperty('--px','0px');el.style.setProperty('--py','0px');el.style.setProperty('--pr','0deg');
      });
    });
  }
  const visibility=()=>root.classList.toggle('page-hidden',document.hidden);
  document.addEventListener('visibilitychange',visibility);
  visibility();
}
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach(button=>{
    button.addEventListener('click',async()=>{
      let copied=false;
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        copied=true;
      } catch {
        const area=document.createElement('textarea');
        area.value=button.dataset.copy;
        area.setAttribute('readonly','');
        area.style.cssText='position:fixed;left:-9999px;top:0';
        document.body.append(area);area.select();
        try { copied=document.execCommand('copy'); } catch { copied=false; }
        area.remove();button.focus({preventScroll:true});
      }
      const status=document.querySelector('.copy-status');
      if (status) status.textContent=copied?button.dataset.success:button.dataset.failure;
    });
  });
}
function initDemo() {
  const demo=document.querySelector('[data-demo]');
  if (!demo) return;
  const form=demo.querySelector('form');
  const start=form.elements.namedItem('start');
  const end=form.elements.namedItem('end');
  const result=demo.querySelector('[data-booking-result]');
  const slot=demo.querySelector('[data-requested-slot]');
  const presets=[...demo.querySelectorAll('[data-preset]')];
  const run=()=>{
    const value=getAvailability(start.value,end.value);
    demo.dataset.status=value.status;
    result.textContent=demo.dataset[value.status];
    start.setAttribute('aria-invalid',String(value.status==='invalid'));
    end.setAttribute('aria-invalid',String(value.status==='invalid'));
    slot.hidden=value.status==='invalid' || value.end<=480 || value.start>=840;
    if (!slot.hidden) {
      const from=Math.max(480,value.start),to=Math.min(840,value.end);
      slot.style.left=`${(from-480)/360*100}%`;
      slot.style.width=`${(to-from)/360*100}%`;
    }
    presets.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===`${start.value},${end.value}`)));
  };
  form.addEventListener('submit',e=>{e.preventDefault();run();});
  presets.forEach(button=>{
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      [start.value,end.value]=button.dataset.preset.split(',');run();
    });
  });
  [start,end].forEach(input=>input.addEventListener('input',()=>presets.forEach(b=>b.setAttribute('aria-pressed','false'))));
}

// Independent modules fail open: readable content does not depend on enhancement.
for (const init of [initLanguage,initDialogs,initDisciplines,initScroll,initCopy,initDemo]) {
  try { init(); } catch(error) { console.warn('[MC] Optional interaction unavailable:',init.name,error); }
}
updateMotion();
motionQuery.addEventListener('change',updateMotion);
document.querySelectorAll('[data-motion-toggle]').forEach(button=>button.addEventListener('click',()=>{
  motionPreference = reduced ? 'allow' : 'reduce';
  storage.set('mc-motion',motionPreference);updateMotion();
}));
try { initVisuals(); } catch(error) { console.warn('[MC] Visual enhancement unavailable:',error); }
root.classList.add('enhanced');
