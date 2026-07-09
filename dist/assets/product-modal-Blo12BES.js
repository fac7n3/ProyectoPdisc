import{a as e,c as t,n,o as r,s as i}from"./cart-utils-BB-_Xszd.js";function a(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}function o(t){let n=t.id,r=t.dataset.price===void 0?e(t.querySelector(`.product-card__price`)?.textContent||`0`):Number(t.dataset.price),i=a(t.querySelector(`.product-card__name`)?.textContent?.trim()||`Producto`),o=a(t.querySelector(`.product-card__shop`)?.textContent?.trim()?.replace(/^\s*/,``)||`Tienda`),s=a(t.querySelector(`.product-card__price`)?.textContent||`$0`),c=a(t.querySelector(`.product-card__price-old`)?.textContent||``),l=a(t.querySelector(`.product-card__discount`)?.textContent||``),u=encodeURI(t.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),d=a(t.querySelector(`.product-card__image img`)?.getAttribute(`alt`)||i),f=a(t.querySelector(`.product-card__shipping`)?.textContent?.trim()||``),p=t.querySelector(`.product-card__stars`),m=p?.querySelectorAll(`.fa-star:not(.empty)`).length||0,h=p?.querySelectorAll(`.fa-star-half-stroke`).length||0,g=p?.querySelectorAll(`.fa-star.empty, .fa-regular.fa-star.empty`).length||0,_=t.querySelector(`.product-card__rating-count`)?.textContent?.replace(/[()]/g,``)||`0`,v=(t.dataset.category||``).split(` `),y=t.querySelector(`.product-card__badge`);return{id:n,price:r,name:i,shop:o,priceText:s,priceOldText:c,discountText:l,imgSrc:u,imgAlt:d,shippingText:f,fullStars:m,halfStars:h,emptyStars:g,ratingCount:_,categories:v,badgeText:y?.textContent?.trim()||``,badgeType:y?.classList.contains(`product-card__badge--envio`)?`envio`:y?.classList.contains(`product-card__badge--oferta`)?`descuento`:``,stock:(n||``).split(``).reduce((e,t)=>e+t.charCodeAt(0),0)%40+5}}function s(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function c(e){return e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function l(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<4&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<6&&r.push(t)}),r.slice(0,6)}function u(e){let t=c(e.stock),n=e.shop.replace(/^[\s\W]*/,``).charAt(0).toUpperCase();e.shop.replace(/^[\s]*/,``).replace(/^\s*\S+\s*/,``);let r=l(e.id,e.categories),i=``;r.forEach(e=>{let t=e.querySelector(`.product-card__name`)?.textContent?.trim()||``,n=e.querySelector(`.product-card__price`)?.textContent||``,r=e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``,a=e.id||``;i+=`
      <div class="pm-related-card" data-related-id="${a}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `});let a=``;e.badgeText&&(a=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let o=``;e.discountText&&(o=`<span class="pm-discount-tag">${e.discountText}</span>`);let u=``;return e.priceOldText&&(u=`<span class="pm-price-old">${e.priceOldText}</span>`),`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${e.name}">
      
      <!-- Top Bar -->
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Main 2-column layout -->
      <div class="pm-main">
        
        <!-- Gallery -->
        <div class="pm-gallery" id="pm-gallery">
          ${a}
          <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
            <i class="fa-regular fa-heart"></i>
          </button>
          <img class="pm-gallery__img" src="${e.imgSrc}" alt="${e.imgAlt}" />
        </div>

        <!-- Product Info -->
        <div class="pm-info">
          
          <div class="pm-shop" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            <i class="fa-solid fa-store"></i>
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            <div class="pm-rating__stars">
              ${s(e.fullStars,e.halfStars,e.emptyStars)}
            </div>
            <span class="pm-rating__count">(${e.ratingCount})</span>
            <span class="pm-rating__sep"></span>
            <span class="pm-rating__sales">${Math.floor(parseInt(e.ratingCount)*2.3)} vendidos</span>
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${u}
              ${o}
            </div>
            <div class="pm-shipping">
              <i class="fa-solid fa-truck"></i>
              ${e.shippingText||`Consultá envío`}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${t.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${t.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${t.fillClass}"></div>
            </div>
          </div>

          <!-- Quantity -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${e.stock}" aria-label="Cantidad" />
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="pm-actions">
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              <i class="fa-solid fa-cart-plus"></i>
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              <i class="fa-solid fa-bolt"></i>
              Comprar ahora
            </button>
          </div>

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            Descubrí <strong>${e.name}</strong> de <strong>${e.shop}</strong>, un producto de primera calidad 
            disponible en tu zona. Comprando local apoyás a los comercios de Baradero y recibís 
            productos frescos y de confianza directo en tu puerta. 
            <br /><br />
            Ideal para el día a día, con la calidad que ya conocés de los negocios de tu barrio.
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item"><i class="fa-solid fa-box"></i> Producto original con garantía del comercio</div>
            <div class="pm-feature-item"><i class="fa-solid fa-weight-scale"></i> Peso/volumen según etiqueta</div>
            <div class="pm-feature-item"><i class="fa-solid fa-store"></i> Vendido por ${e.shop}</div>
            <div class="pm-feature-item"><i class="fa-solid fa-truck"></i> ${e.shippingText||`Consultá disponibilidad de envío`}</div>
            <div class="pm-feature-item"><i class="fa-solid fa-shield-halved"></i> Devolución gratuita dentro de las 48hs</div>
            <div class="pm-feature-item"><i class="fa-solid fa-location-dot"></i> Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${n}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${e.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" aria-label="Ver todos los productos de ${e.shop}">
              Ver tienda
            </button>
          </div>
        </div>
      </div>

      ${r.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__scroll">
            ${i}
          </div>
        </div>
      `:``}

    </div>
  `}var d=null,f=null,p=null;function m(e){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}d&&h(),f=document.activeElement,p=o(e);let t=document.createElement(`div`);t.className=`product-modal-overlay`,t.id=`pm-overlay`,t.innerHTML=u(p),document.body.appendChild(t),d=t;let n=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,n+`px`),document.body.classList.add(`modal-open`),t.offsetHeight,requestAnimationFrame(()=>t.classList.add(`is-open`)),g(t,p);let r=t.querySelector(`.pm-stock__fill`);r&&(r.style.width||window.getComputedStyle(r).width,r.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{r.style.width=``})}))}function h(){if(!d)return;d.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=d;d=null,setTimeout(()=>{e.remove()},400),f&&=(f.focus(),null)}function g(a,o){let s=a.querySelector(`.product-modal`);a.querySelector(`#pm-close-back`)?.addEventListener(`click`,h),a.querySelector(`#pm-close-btn`)?.addEventListener(`click`,h),a.addEventListener(`click`,e=>{e.target===a&&h()});let c=e=>{e.key===`Escape`&&(h(),document.removeEventListener(`keydown`,c))};document.addEventListener(`keydown`,c);let l=a.querySelector(`#pm-gallery`);l?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||l.classList.toggle(`is-zoomed`)});let u=a.querySelector(`#pm-fav-btn`);u?.addEventListener(`click`,()=>{let e=u.querySelector(`i`);u.classList.contains(`is-active`)?(u.classList.remove(`is-active`),e.classList.replace(`fa-solid`,`fa-regular`),i(`Eliminado de favoritos`)):(u.classList.add(`is-active`),e.classList.replace(`fa-regular`,`fa-solid`),i(`Agregado a favoritos`,`success`))});let d=a.querySelector(`#pm-qty-value`),f=a.querySelector(`#pm-qty-minus`),p=a.querySelector(`#pm-qty-plus`);function g(){let e=parseInt(d.value,10)||1;f.disabled=e<=1,p.disabled=e>=o.stock}f?.addEventListener(`click`,()=>{let e=parseInt(d.value,10)||1;e>1&&(d.value=e-1),g()}),p?.addEventListener(`click`,()=>{let e=parseInt(d.value,10)||1;e<o.stock&&(d.value=e+1),g()}),d?.addEventListener(`change`,()=>{let e=parseInt(d.value,10)||1;e=Math.max(1,Math.min(e,o.stock)),d.value=e,g()});let _=a.querySelector(`#pm-add-cart`);_?.addEventListener(`click`,()=>{let a=parseInt(d?.value,10)||1,s=e(o.priceOldText),c=n(),l=c.find(e=>e.id===o.id);l?l.qty+=a:c.push({id:o.id,name:o.name,shop:o.shop,price:o.price,priceOld:s||null,image:o.imgSrc,qty:a}),r(c),t(),_.classList.add(`pm-btn--added`);let u=_.innerHTML;_.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{_.classList.remove(`pm-btn--added`),_.innerHTML=u},1800),i(`${o.name} agregado al carrito (x${a})`,`success`)}),a.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let i=parseInt(d?.value,10)||1,a=e(o.priceOldText),s=n(),c=s.find(e=>e.id===o.id);c?c.qty+=i:s.push({id:o.id,name:o.name,shop:o.shop,price:o.price,priceOld:a||null,image:o.imgSrc,qty:i}),r(s),t(),h();let l=window.location.pathname.includes(`/pages/`);window.location.href=l?`./carrito.html`:`./pages/carrito.html`}),a.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:o.name,text:`Mirá ${o.name} en Baradero Local por ${o.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),i(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),i(`¡Link copiado!`,`success`)}catch{}}});let v=a.querySelectorAll(`.pm-tab`),y=a.querySelectorAll(`.pm-tab-content`);v.forEach(e=>{e.addEventListener(`click`,()=>{v.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),y.forEach(e=>e.classList.remove(`is-visible`)),e.classList.add(`is-active`),e.setAttribute(`aria-selected`,`true`);let t=e.dataset.tab,n=a.querySelector(`[data-tab-content="${t}"]`);n&&n.classList.add(`is-visible`)})}),a.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&(h(),setTimeout(()=>m(n),450))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let b=s.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),x=b[0],S=b[b.length-1];s.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===x&&(e.preventDefault(),S.focus()):document.activeElement===S&&(e.preventDefault(),x.focus()))}),setTimeout(()=>x?.focus(),100)}function _(){document.querySelectorAll(`.products__grid`).forEach(e=>{e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),m(t))})})}typeof window<`u`&&(window.initProductModal=_,window.openProductModal=m,window.closeProductModal=h);