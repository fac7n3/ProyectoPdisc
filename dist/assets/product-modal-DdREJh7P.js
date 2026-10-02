import{u as e}from"./speed-insights-DJJF3mrb.js";import{A as t,C as n,D as r,M as i,N as a,O as o,a as s,b as c,h as l,j as u,o as d,p as f,s as p,x as m,y as h}from"./cart-utils-DoJOkl1g.js";import{i as g,r as _}from"./reviews-utils-BKeAvZiu.js";function v(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function y(t){let[{data:n,error:r},i,{data:{session:o}}]=await Promise.all([e.from(`products`).select(`id, title, description, price, compare_at_price, offer_expires_at, stock, image_url, stores(id, name, owner_id, delivery_fee, free_shipping_threshold), product_images(url, position), product_options(id, name, position, product_option_values(id, value, is_available, position))`).eq(`id`,t).single(),_(`product`,t),e.auth.getSession()]);if(r||!n)throw r||Error(`Producto no encontrado`);let c=f(n),l=!!(n.compare_at_price&&n.compare_at_price>n.price&&!c),u=l?Math.round((1-n.price/n.compare_at_price)*100):0,d=n.stores||{},p=(n.product_images||[]).slice().sort((e,t)=>e.position-t.position),m=[n.image_url||`/img/no-image.svg`,...p.map(e=>e.url)],h=d.free_shipping_threshold!=null&&n.price>=d.free_shipping_threshold,g;g=d.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:h||d.delivery_fee===0?`Envío gratis en este comercio.`:`Envío: ${s(d.delivery_fee)}`+(d.free_shipping_threshold?` (gratis desde ${s(d.free_shipping_threshold)})`:``);let y=``,b=``;l?(y=`-${u}%`,b=`descuento`):h&&(y=`Envío gratis`,b=`envio`);let x=i.average,S=i.count,C=x?Math.floor(x):0,w=x&&x-Math.floor(x)>=.5?1:0,T=Math.max(0,5-C-w),E=!!(o?.user?.id&&d.owner_id&&o.user.id===d.owner_id);return{id:n.id,isOwner:E,price:n.price,name:v(n.title||`Producto`),description:v(n.description||``),shop:v(d.name||`Comercio`),shopId:d.id||null,priceText:s(n.price),priceOldText:l?s(n.compare_at_price):``,discountText:l?`-${u}%`:``,images:m,imgSrc:m[0],imgAlt:v(n.title||`Producto`),shippingText:g,fullStars:C,halfStars:w,emptyStars:T,ratingCount:S,hasRating:S>0,badgeText:y,badgeType:b,stock:n.stock??0,optionGroups:a((n.product_options||[]).map(e=>({...e,values:e.product_option_values||[]})))}}function b(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function x(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function S(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<8&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<12&&r.push(t)}),r.slice(0,12)}function C(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function w(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading" role="status" aria-live="polite">
        <div class="bl-spinner" aria-hidden="true">
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
        </div>
        <p class="bl-loading-block__title">Cargando</p>
        <p class="bl-loading-block__subtitle">Esto puede tomar unos segundos…</p>
      </div>
    </div>
  `}function T(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Error al cargar el producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-modal-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>No se pudo cargar el producto.</p>
        <button type="button" class="pm-modal-error__retry" id="pm-retry-btn">Reintentar</button>
      </div>
    </div>
  `}function E(e){let t=x(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=S(e.id,e.categories||[]),a=``;i.forEach(e=>{let t=v(e.querySelector(`.product-card__name`)?.textContent?.trim()||``),n=v(e.querySelector(`.product-card__price`)?.textContent||``),r=encodeURI(e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),i=v(e.id||``);a+=`
      <div class="pm-related-card" data-related-id="${i}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `});let o=``;e.badgeText&&(o=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let s=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,c=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,l=``;e.images.length>1&&(l=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let u=e.hasRating?`
      <div class="pm-rating__stars">${b(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,d=``;return e.optionGroups.length>0&&(d=`
      <div class="pm-options" id="pm-options">
        ${e.optionGroups.map(e=>`
          <fieldset class="pm-option">
            <legend class="pm-option__title">${v(e.name)}</legend>
            <div class="pm-option__chips">
              ${e.values.map(t=>`
                <label class="pm-option__chip${t.is_available?``:` pm-option__chip--out`}">
                  <input type="radio" name="pm-opt-${v(e.id)}" value="${v(t.id)}" ${t.is_available?``:`disabled`} />
                  <span>${v(t.value)}</span>
                </label>
              `).join(``)}
            </div>
          </fieldset>
        `).join(``)}
      </div>
    `),`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${e.name}">

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

      <div class="pm-main">

        <div class="pm-gallery-col">
          <div class="pm-gallery" id="pm-gallery">
            ${o}
            ${e.isOwner?``:`
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            `}
            ${e.images.length>1?`
            <button class="pm-gallery__nav pm-gallery__nav--prev" id="pm-gallery-prev" aria-label="Imagen anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="pm-gallery__nav pm-gallery__nav--next" id="pm-gallery-next" aria-label="Imagen siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            `:``}
            <img class="pm-gallery__img" id="pm-gallery-img" src="${encodeURI(e.imgSrc)}" alt="${e.imgAlt}" />
          </div>
          ${l}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${u}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${c}
              ${s}
            </div>
            <div class="pm-shipping">
              ${e.shippingText}
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

          ${d}

          <!-- Quantity: se muestra siempre, pero el dueño viendo su propia vista
               previa no puede sumar/restar (es solo una vista previa, no una compra) -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              `}
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(e.stock,1)}" aria-label="Cantidad" ${n||e.isOwner?`disabled`:``} />
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${n?`disabled`:``}>
                <i class="fa-solid fa-plus"></i>
              </button>
              `}
            </div>
          </div>

          <!-- Actions -->
          ${e.isOwner?`
          <div class="pm-actions">
            <p class="pm-owner-notice"><i class="fa-solid fa-store" aria-hidden="true"></i> Este es tu producto -- así lo ven tus clientes.</p>
          </div>
          `:`
          <div class="pm-actions">
            ${n?`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart" disabled>
              Sin stock
            </button>
            `:`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              Comprar ahora
            </button>
            `}
          </div>
          `}

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
          <button class="pm-tab" data-tab="reviews" role="tab" aria-selected="false">Reseñas${e.hasRating?` (${e.ratingCount})`:``}</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            ${e.description||`Producto de <strong>${e.shop}</strong>, disponible en tu zona. Comprando local apoyás a los comercios de Baradero.`}
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item">Vendido por ${e.shop}</div>
            <div class="pm-feature-item">${e.shippingText}</div>
            <div class="pm-feature-item">Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${r}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${e.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" id="pm-view-shop-btn" aria-label="Ver todos los productos de ${e.shop}">
              Ver tienda
            </button>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="reviews">
          <div id="pm-reviews-container">
            <p style="color: var(--bl-text-muted); font-size: 0.9rem;">Cargando reseñas...</p>
          </div>
        </div>
      </div>

      ${i.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__carousel">
            <button type="button" class="pm-related__nav pm-related__nav--prev" aria-label="Ver productos relacionados anteriores">
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="pm-related__scroll">
              ${a}
            </div>
            <button type="button" class="pm-related__nav pm-related__nav--next" aria-label="Ver más productos relacionados">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `:``}

    </div>
  `}var D=null,O=null,k=null;function A(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function j(){let e=history.state?.pmDepth||0;e>0?history.go(-e):N()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&document.getElementById(t);n?M(n,{skipHistoryPush:!0}):D&&N()});async function M(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}D&&N(),O=document.activeElement;let n=e.id,r=(e.dataset.category||``).split(` `);t||A(n);let i=document.createElement(`div`);i.className=`product-modal-overlay`,i.id=`pm-overlay`,i.innerHTML=w(),document.body.appendChild(i),D=i;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),i.offsetHeight,requestAnimationFrame(()=>i.classList.add(`is-open`)),i.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&j()}),k=e=>{e.key===`Escape`&&j()},document.addEventListener(`keydown`,k);try{let e=await y(n);if(e.categories=r,D!==i)return;i.innerHTML=E(e),P(i,e);let t=i.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),D!==i)return;i.innerHTML=T(),i.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>M(e))}}function N(){if(!D)return;D.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=D;D=null,k&&=(document.removeEventListener(`keydown`,k),null),setTimeout(()=>{e.remove()},400),O&&=(O.focus(),null)}function P(e,a){let s=e.querySelector(`.product-modal`),f=e.querySelector(`#pm-gallery`);f?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||e.target.closest(`.pm-gallery__nav`)||f.classList.toggle(`is-zoomed`)});let _=e.querySelector(`#pm-gallery-img`),v=Array.from(e.querySelectorAll(`.pm-thumb`)),y=0;function b(e){let t=a.images.length;if(t===0)return;y=(e%t+t)%t;let n=a.images[y];_&&n&&(_.src=encodeURI(n)),v.forEach((e,t)=>e.classList.toggle(`is-active`,t===y))}if(v.forEach((e,t)=>{e.addEventListener(`click`,()=>b(t))}),e.querySelector(`#pm-gallery-prev`)?.addEventListener(`click`,()=>b(y-1)),e.querySelector(`#pm-gallery-next`)?.addEventListener(`click`,()=>b(y+1)),a.shopId){let t=()=>{window.location.href=C(a.shopId)},n=e.querySelector(`#pm-shop-link`);n?.addEventListener(`click`,t),n?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,t)}let x=e.querySelector(`#pm-fav-btn`);if(x&&a.id){let e=x.querySelector(`i`),t=!1;p().then(n=>{t=n.includes(a.id),x.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t)}),x.addEventListener(`click`,async()=>{let n=t;t=!n,x.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t),c(t?`Agregado a favoritos`:`Eliminado de favoritos`,t?`success`:`default`);try{await m(a.id,n)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let S=e.querySelector(`#pm-qty-value`),w=e.querySelector(`#pm-qty-minus`),T=e.querySelector(`#pm-qty-plus`);function E(){let e=parseInt(S.value,10)||1;w.disabled=e<=1,T.disabled=e>=a.stock}w?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e>1&&(S.value=e-1),E()}),T?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e<a.stock&&(S.value=e+1),E()}),S?.addEventListener(`change`,()=>{let e=parseInt(S.value,10)||1;e=Math.max(1,Math.min(e,a.stock)),S.value=e,E()});let D=e.querySelector(`#pm-add-cart`);D?.addEventListener(`click`,()=>{let s=parseInt(S?.value,10)||1,f=l(a.priceOldText),p=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),m=i(a.optionGroups,p);if(m.length>0){c(`Elegí ${m.map(e=>e.toLowerCase()).join(` y `)} antes de agregar al carrito.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let g=r(a.optionGroups,p),_=o(a.id,p),v=d(),y=v.find(e=>u(e)===_);y?(y.qty+=s,y.selected=!0):v.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:f||null,image:a.imgSrc,qty:s,options:p,optionsLabel:g,selected:!0}),h(v),n(),D.classList.add(`pm-btn--added`);let b=D.innerHTML;D.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{D.classList.remove(`pm-btn--added`),D.innerHTML=b},1800);let x=t(r(a.optionGroups,p));c(`${a.name}${x?` (${x})`:``} agregado al carrito (x${s})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let t=parseInt(S?.value,10)||1,s=l(a.priceOldText),f=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),p=i(a.optionGroups,f);if(p.length>0){c(`Elegí ${p.map(e=>e.toLowerCase()).join(` y `)} antes de comprar.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let m=o(a.id,f),g=d(),_=g.find(e=>u(e)===m);_?(_.qty+=t,_.selected=!0):g.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:s||null,image:a.imgSrc,qty:t,options:f,optionsLabel:r(a.optionGroups,f),selected:!0}),h(g),n(),N();let v=window.location.pathname.includes(`/pages/`);window.location.href=v?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:a.name,text:`Mirá ${a.name} en Baradero Local por ${a.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),c(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),c(`¡Link copiado!`,`success`)}catch{}}});let O=e.querySelectorAll(`.pm-tab`),k=e.querySelectorAll(`.pm-tab-content`),A=!1;O.forEach(t=>{t.addEventListener(`click`,()=>{O.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),k.forEach(e=>e.classList.remove(`is-visible`)),t.classList.add(`is-active`),t.setAttribute(`aria-selected`,`true`);let n=t.dataset.tab,r=e.querySelector(`[data-tab-content="${n}"]`);if(r&&r.classList.add(`is-visible`),n===`reviews`&&!A){A=!0;let t=e.querySelector(`#pm-reviews-container`);t&&g(t,`product`,a.id,{hideForm:a.isOwner})}})}),e.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&(N(),setTimeout(()=>M(n),450))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let j=e.querySelector(`.pm-related__scroll`);if(j){let t=e.querySelector(`.pm-related__nav--prev`),n=e.querySelector(`.pm-related__nav--next`),r=e=>{let t=j.querySelector(`.pm-related-card`),n=t?t.getBoundingClientRect().width+14:174;j.scrollBy({left:e*n*2,behavior:`smooth`})},i=()=>{let e=j.scrollWidth-j.clientWidth,r=j.scrollLeft<=4,i=j.scrollLeft>=e-4;t&&(t.disabled=r),n&&(n.disabled=e<=4||i)};t?.addEventListener(`click`,()=>r(-1)),n?.addEventListener(`click`,()=>r(1)),j.addEventListener(`scroll`,i,{passive:!0}),i()}let P=s.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),F=P[0],I=P[P.length-1];s.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===F&&(e.preventDefault(),I.focus()):document.activeElement===I&&(e.preventDefault(),F.focus()))}),setTimeout(()=>F?.focus(),100)}function F(){document.querySelectorAll(`.products__grid`).forEach(e=>{e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),M(t))})})}typeof window<`u`&&(window.initProductModal=F,window.openProductModal=M,window.closeProductModal=N);