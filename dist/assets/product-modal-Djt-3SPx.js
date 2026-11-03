import{u as e}from"./speed-insights-CUvzssRN.js";import{A as t,D as n,E as r,M as i,S as a,a as o,b as s,f as c,i as l,j as u,k as d,m as f,o as p,v as m,y as h}from"./cart-utils-sfS7V7TP.js";import{i as g}from"./reviews-utils-CopZU83P.js";import{n as _,t as v}from"./product-detail-api-CBEene8L.js";function y(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function b(t){let[n,{data:{session:r}}]=await Promise.all([v(t),e.auth.getSession()]),a=c(n),o=!!(n.compare_at_price&&n.compare_at_price>n.price&&!a),s=o?Math.round((1-n.price/n.compare_at_price)*100):0,u=n.stores||{},d=(n.product_images||[]).filter(e=>e.url!==n.image_url).sort((e,t)=>e.position-t.position),f=[n.image_url||`/img/no-image.svg`,...d.map(e=>e.url)],p=u.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:`Envío: ${l(u.delivery_fee)}`,m=``,h=``;o&&(m=`-${s}%`,h=`descuento`);let g=n.review_average,_=n.review_count??0,b=g?Math.floor(g):0,x=g&&g-Math.floor(g)>=.5?1:0,S=Math.max(0,5-b-x),C=!!(r?.user?.id&&u.owner_id&&r.user.id===u.owner_id);return{id:n.id,isOwner:C,price:n.price,name:y(n.title||`Producto`),description:y(n.description||``),shop:y(u.name||`Comercio`),shopId:u.id||null,priceText:l(n.price),priceOldText:o?l(n.compare_at_price):``,discountText:o?`-${s}%`:``,images:f,imgSrc:f[0],imgAlt:y(n.title||`Producto`),shippingText:p,fullStars:b,halfStars:x,emptyStars:S,ratingCount:_,hasRating:_>0,badgeText:m,badgeType:h,stock:n.stock??0,optionGroups:i((n.product_options||[]).map(e=>({...e,values:e.product_option_values||[]})))}}function x(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function S(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}var C=12;async function w(t){try{let{data:n,error:r}=await e.from(`products`).select(`category_id`).eq(`id`,t).maybeSingle();if(r||!n?.category_id)return[];let{data:i,error:a}=await e.from(`products`).select(`id, title, price, compare_at_price, offer_expires_at, image_url, stock`).eq(`category_id`,n.category_id).eq(`is_active`,!0).gt(`stock`,0).neq(`id`,t).order(`created_at`,{ascending:!1}).limit(36);if(a||!i)return[];let o=[...i];for(let e=o.length-1;e>0;e--){let t=Math.floor(Math.random()*(e+1));[o[e],o[t]]=[o[t],o[e]]}return o.slice(0,C)}catch(e){return console.error(`No se pudieron cargar los productos relacionados:`,e),[]}}function T(e){let t=document.createElement(`article`);t.className=`product-card`,t.id=e.id;let n=document.createElement(`div`);n.className=`product-card__image`;let r=document.createElement(`img`);r.setAttribute(`src`,e.image_url||`/img/no-image.svg`),n.appendChild(r);let i=document.createElement(`div`);i.className=`product-card__name`,i.textContent=e.title||``;let a=document.createElement(`div`);return a.className=`product-card__price`,a.textContent=e.price==null?``:l(e.price),t.append(n,i,a),t}function E(e,t){let n=e.querySelector(`.pm-related-slot`);if(!n||!t.length)return;n.innerHTML=`
    <hr class="pm-divider" />
    <div class="pm-related">
      <h3 class="pm-related__title">Productos relacionados</h3>
      <div class="pm-related__scroll">${t.map(e=>{let t=y(e.title||``),n=y(l(e.price)),r=encodeURI(e.image_url||`/img/no-image.svg`);return`
      <div class="pm-related-card" data-related-id="${y(e.id)}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `}).join(``)}</div>
    </div>
  `;let r=new Map(t.map(e=>[e.id,e]));n.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=r.get(e.dataset.relatedId);t&&R(T(t))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})})}function D(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function O(){return`
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
  `}function k(e){let t=t=>e.querySelector(t)?.textContent?.trim()||``,n=t(`.product-card__name`)||t(`.fav-title`);return n?{title:n,shop:t(`.product-card__shop`),price:t(`.product-card__price`)||t(`.fav-price`),priceOld:t(`.product-card__price-old`),discount:t(`.product-card__discount`),image:e.querySelector(`.product-card__image img, img`)?.getAttribute(`src`)||``}:null}function A(e){let t=y(e.title),n=e.shop?`<div class="pm-shop">${y(e.shop)}</div>`:`<div class="pm-skel pm-skel--pill" aria-hidden="true"></div>`,r=e.price?`<span class="pm-price">${y(e.price)}</span>`:`<span class="pm-skel pm-skel--price" aria-hidden="true"></span>`,i=e.priceOld?`<span class="pm-price-old">${y(e.priceOld)}</span>`:``,a=e.discount?`<span class="pm-discount-tag">${y(e.discount)}</span>`:``;return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando ${t}" aria-busy="true">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-main">
        <div class="pm-gallery-col">
          <div class="pm-gallery">${e.image?`<img class="pm-gallery__img" src="${encodeURI(e.image)}" alt="${t}" />`:``}</div>
        </div>
        <div class="pm-info">
          ${n}
          <h2 class="pm-name">${t}</h2>
          <div class="pm-rating"><span class="pm-skel pm-skel--line pm-skel--short" aria-hidden="true"></span></div>
          <div class="pm-price-block">
            <div class="pm-price-row">${r}${i}${a}</div>
            <div class="pm-shipping"><span class="pm-skel pm-skel--line" aria-hidden="true"></span></div>
          </div>
          <div class="pm-stock"><span class="pm-skel pm-skel--line pm-skel--short" aria-hidden="true"></span></div>
          <div class="pm-actions" aria-hidden="true">
            <span class="pm-skel pm-skel--btn"></span>
            <span class="pm-skel pm-skel--btn"></span>
          </div>
          <p class="sr-only" role="status" aria-live="polite">Cargando el detalle del producto…</p>
        </div>
      </div>
    </div>
  `}function j(){return`
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
  `}function M(e){let t=S(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=``;e.badgeText&&(i=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let a=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,o=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,s=``;e.images.length>1&&(s=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let c=e.hasRating?`
      <div class="pm-rating__stars">${x(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,l=``;return e.optionGroups.length>0&&(l=`
      <div class="pm-options" id="pm-options">
        ${e.optionGroups.map(e=>`
          <fieldset class="pm-option">
            <legend class="pm-option__title">${y(e.name)}</legend>
            <div class="pm-option__chips">
              ${e.values.map(t=>`
                <label class="pm-option__chip${t.is_available?``:` pm-option__chip--out`}">
                  <input type="radio" name="pm-opt-${y(e.id)}" value="${y(t.id)}" ${t.is_available?``:`disabled`} />
                  <span>${y(t.value)}</span>
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
            ${i}
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
          ${s}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${c}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${o}
              ${a}
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

          ${l}

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

      <!-- Productos relacionados: se llena después (renderRelatedSection) -->
      <div class="pm-related-slot"></div>

    </div>
  `}var N=null,P=null,F=null;function I(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function L(){let e=history.state?.pmDepth||0;e>0?history.go(-e):z()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&(document.getElementById(t)||T({id:t}));n?R(n,{skipHistoryPush:!0}):N&&z()});async function R(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}N&&z(),P=document.activeElement;let n=e.id;t||I(n);let r=document.createElement(`div`);r.className=`product-modal-overlay`,r.id=`pm-overlay`;let i=k(e);r.innerHTML=i?A(i):O(),document.body.appendChild(r),N=r;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),r.offsetHeight,requestAnimationFrame(()=>r.classList.add(`is-open`)),r.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&L()}),F=e=>{e.key===`Escape`&&L()},document.addEventListener(`keydown`,F);let o=w(n);try{let e=await b(n);if(N!==r)return;r.innerHTML=M(e),B(r,e),o.then(e=>{N===r&&E(r,e)});let t=r.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),N!==r)return;r.innerHTML=j(),r.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>R(e))}}function z(){if(!N)return;N.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=N;N=null,F&&=(document.removeEventListener(`keydown`,F),null),setTimeout(()=>{e.remove()},400),P&&=(P.focus(),null)}function B(e,i){let c=e.querySelector(`.product-modal`),l=e.querySelector(`#pm-gallery`);l?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||e.target.closest(`.pm-gallery__nav`)||l.classList.toggle(`is-zoomed`)});let _=e.querySelector(`#pm-gallery-img`),v=Array.from(e.querySelectorAll(`.pm-thumb`)),y=0;function b(e){let t=i.images.length;if(t===0)return;y=(e%t+t)%t;let n=i.images[y];_&&n&&(_.src=encodeURI(n)),v.forEach((e,t)=>e.classList.toggle(`is-active`,t===y))}if(v.forEach((e,t)=>{e.addEventListener(`click`,()=>b(t))}),e.querySelector(`#pm-gallery-prev`)?.addEventListener(`click`,()=>b(y-1)),e.querySelector(`#pm-gallery-next`)?.addEventListener(`click`,()=>b(y+1)),i.shopId){let t=()=>{window.location.href=D(i.shopId)},n=e.querySelector(`#pm-shop-link`);n?.addEventListener(`click`,t),n?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,t)}let x=e.querySelector(`#pm-fav-btn`);if(x&&i.id){let e=x.querySelector(`i`),t=!1;p().then(n=>{t=n.includes(i.id),x.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t)}),x.addEventListener(`click`,async()=>{let n=t;t=!n,x.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t),h(t?`Agregado a favoritos`:`Eliminado de favoritos`,t?`success`:`default`);try{await s(i.id,n)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let S=e.querySelector(`#pm-qty-value`),C=e.querySelector(`#pm-qty-minus`),w=e.querySelector(`#pm-qty-plus`);function T(){let e=parseInt(S.value,10)||1;C.disabled=e<=1,w.disabled=e>=i.stock}C?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e>1&&(S.value=e-1),T()}),w?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e<i.stock&&(S.value=e+1),T()}),S?.addEventListener(`change`,()=>{let e=parseInt(S.value,10)||1;e=Math.max(1,Math.min(e,i.stock)),S.value=e,T()});let E=e.querySelector(`#pm-add-cart`);E?.addEventListener(`click`,()=>{let s=parseInt(S?.value,10)||1,c=f(i.priceOldText),l=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),p=u(i.optionGroups,l);if(p.length>0){h(`Elegí ${p.map(e=>e.toLowerCase()).join(` y `)} antes de agregar al carrito.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let g=r(i.optionGroups,l),_=n(i.id,l),v=o(),y=v.find(e=>t(e)===_);y?(y.qty+=s,y.selected=!0):v.push({id:i.id,name:i.name,shop:i.shop,price:i.price,priceOld:c||null,image:i.imgSrc,qty:s,options:l,optionsLabel:g,selected:!0}),m(v),a(),E.classList.add(`pm-btn--added`);let b=E.innerHTML;E.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{E.classList.remove(`pm-btn--added`),E.innerHTML=b},1800);let x=d(r(i.optionGroups,l));h(`${i.name}${x?` (${x})`:``} agregado al carrito (x${s})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let s=parseInt(S?.value,10)||1,c=f(i.priceOldText),l=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),d=u(i.optionGroups,l);if(d.length>0){h(`Elegí ${d.map(e=>e.toLowerCase()).join(` y `)} antes de comprar.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let p=n(i.id,l),g=o(),_=g.find(e=>t(e)===p);_?(_.qty+=s,_.selected=!0):g.push({id:i.id,name:i.name,shop:i.shop,price:i.price,priceOld:c||null,image:i.imgSrc,qty:s,options:l,optionsLabel:r(i.optionGroups,l),selected:!0}),m(g),a(),z();let v=window.location.pathname.includes(`/pages/`);window.location.href=v?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:i.name,text:`Mirá ${i.name} en Baradero Local por ${i.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),h(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),h(`¡Link copiado!`,`success`)}catch{}}});let O=e.querySelectorAll(`.pm-tab`),k=e.querySelectorAll(`.pm-tab-content`),A=!1;O.forEach(t=>{t.addEventListener(`click`,()=>{O.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),k.forEach(e=>e.classList.remove(`is-visible`)),t.classList.add(`is-active`),t.setAttribute(`aria-selected`,`true`);let n=t.dataset.tab,r=e.querySelector(`[data-tab-content="${n}"]`);if(r&&r.classList.add(`is-visible`),n===`reviews`&&!A){A=!0;let t=e.querySelector(`#pm-reviews-container`);t&&g(t,`product`,i.id,{hideForm:i.isOwner})}})});let j=()=>[...c.querySelectorAll(`button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`)],M=j()[0];c.addEventListener(`keydown`,e=>{if(e.key!==`Tab`)return;let t=j(),n=t[0],r=t[t.length-1];n&&r&&(e.shiftKey?document.activeElement===n&&(e.preventDefault(),r.focus()):document.activeElement===r&&(e.preventDefault(),n.focus()))}),setTimeout(()=>M?.focus(),100)}var V=100,H=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;function U(e){let t=e.target.closest?.(`.product-card`);return!t||!H.test(t.id)||t.matches(`a[href]`)||e.target.closest(`.product-card__add, .product-card__wishlist`)?null:t}function W(e){let t=null,n=null;e.addEventListener(`pointerover`,e=>{if(e.pointerType!==`mouse`)return;let r=U(e);r&&r!==n&&(clearTimeout(t),n=r,t=setTimeout(()=>_(r.id),V))}),e.addEventListener(`pointerout`,e=>{n&&(e.relatedTarget&&n.contains(e.relatedTarget)||(clearTimeout(t),n=null))}),e.addEventListener(`pointerdown`,e=>{let t=U(e);t&&_(t.id)})}function G(){document.querySelectorAll(`.products__grid`).forEach(e=>{W(e),e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),R(t))})})}typeof window<`u`&&(window.initProductModal=G,window.openProductModal=R,window.closeProductModal=z);