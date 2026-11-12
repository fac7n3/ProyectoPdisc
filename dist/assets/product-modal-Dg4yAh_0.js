import{u as e}from"./speed-insights-NIs88Q42.js";import{a as t}from"./storage-utils-DhPqDdRg.js";import{A as n,D as r,E as i,M as a,S as o,a as s,b as c,f as l,i as u,j as d,k as f,m as p,o as m,v as h,y as g}from"./cart-utils-iskUsnnN.js";import{l as _,n as v,t as y}from"./product-detail-api-hJchp7F0.js";import{i as b}from"./reviews-utils-BWKEVW9Y.js";var x=/^\/img\/productos\/([^/]+\.webp)$/,S=`(max-width: 480px) 46vw, (max-width: 900px) 30vw, 280px`;function C(e){let t=x.exec(String(e||``));return t?`/img/productos/s/${t[1]}`:null}function w(e,t,n=S){let r=t||`/img/no-image.svg`;e.setAttribute(`src`,r);let i=C(r);return i&&(e.setAttribute(`srcset`,`${i} 520w, ${r} 800w`),e.setAttribute(`sizes`,n)),e}function T(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function E(n){let[r,{data:{session:i}}]=await Promise.all([y(n),e.auth.getSession()]),o=l(r),s=!!(r.compare_at_price&&r.compare_at_price>r.price&&!o),c=s?Math.round((1-r.price/r.compare_at_price)*100):0,d=r.stores||{},f=(r.product_images||[]).filter(e=>e.url!==r.image_url).sort((e,t)=>e.position-t.position),p=[r.image_url||`/img/no-image.svg`,...f.map(e=>e.url)],m=d.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:`Envío: ${u(d.delivery_fee)}`,h=``,g=``;s&&(h=`-${c}%`,g=`descuento`);let _=r.review_average,v=r.review_count??0,b=_?Math.floor(_):0,x=_&&_-Math.floor(_)>=.5?1:0,S=Math.max(0,5-b-x),C=!!(i?.user?.id&&d.owner_id&&i.user.id===d.owner_id);return{id:r.id,isOwner:C,price:r.price,name:T(r.title||`Producto`),description:T(r.description||``),shop:T(d.name||`Comercio`),shopId:d.id||null,priceText:u(r.price),priceOldText:s?u(r.compare_at_price):``,discountText:s?`-${c}%`:``,images:p,videoUrl:t(r.video_url),imgSrc:p[0],imgAlt:T(r.title||`Producto`),shippingText:m,fullStars:b,halfStars:x,emptyStars:S,ratingCount:v,hasRating:v>0,badgeText:h,badgeType:g,stock:r.stock??0,optionGroups:a((r.product_options||[]).map(e=>({...e,values:e.product_option_values||[]})))}}function D(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function O(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}var k=12;async function A(t){try{let{data:n,error:r}=await e.from(`products`).select(`category_id`).eq(`id`,t).maybeSingle();if(r||!n?.category_id)return[];let{data:i,error:a}=await e.from(`products`).select(`id, title, price, compare_at_price, offer_expires_at, image_url, stock`).eq(`category_id`,n.category_id).eq(`is_active`,!0).gt(`stock`,0).neq(`id`,t).order(`created_at`,{ascending:!1}).limit(36);if(a||!i)return[];let o=[...i];for(let e=o.length-1;e>0;e--){let t=Math.floor(Math.random()*(e+1));[o[e],o[t]]=[o[t],o[e]]}return o.slice(0,k)}catch(e){return console.error(`No se pudieron cargar los productos relacionados:`,e),[]}}function j(e){let t=document.createElement(`article`);t.className=`product-card`,t.id=e.id;let n=document.createElement(`div`);n.className=`product-card__image`;let r=document.createElement(`img`);w(r,e.image_url,`160px`),n.appendChild(r);let i=document.createElement(`div`);i.className=`product-card__name`,i.textContent=e.title||``;let a=document.createElement(`div`);return a.className=`product-card__price`,a.textContent=e.price==null?``:u(e.price),t.append(n,i,a),t}function M(e,t){let n=e.querySelector(`.pm-related-slot`);if(!n||!t.length)return;n.innerHTML=`
    <hr class="pm-divider" />
    <div class="pm-related">
      <h3 class="pm-related__title">Productos relacionados</h3>
      <div class="pm-related__scroll">${t.map(e=>{let t=T(e.title||``),n=T(u(e.price)),r=encodeURI(e.image_url||`/img/no-image.svg`);return`
      <div class="pm-related-card" data-related-id="${T(e.id)}" tabindex="0" role="button" aria-label="Ver ${t}">
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
  `;let r=new Map(t.map(e=>[e.id,e]));n.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=r.get(e.dataset.relatedId);t&&W(j(t))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})})}function N(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function P(){return`
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
  `}function F(e){let t=t=>e.querySelector(t)?.textContent?.trim()||``,n=t(`.product-card__name`)||t(`.fav-title`);return n?{title:n,shop:t(`.product-card__shop`),price:t(`.product-card__price`)||t(`.fav-price`),priceOld:t(`.product-card__price-old`),discount:t(`.product-card__discount`),image:e.querySelector(`.product-card__image img, img`)?.getAttribute(`src`)||``}:null}function I(e){let t=T(e.title),n=e.shop?`<div class="pm-shop">${T(e.shop)}</div>`:`<div class="pm-skel pm-skel--pill" aria-hidden="true"></div>`,r=e.price?`<span class="pm-price">${T(e.price)}</span>`:`<span class="pm-skel pm-skel--price" aria-hidden="true"></span>`,i=e.priceOld?`<span class="pm-price-old">${T(e.priceOld)}</span>`:``,a=e.discount?`<span class="pm-discount-tag">${T(e.discount)}</span>`:``;return`
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
  `}function L(){return`
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
  `}function R(e){let t=O(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=``;e.badgeText&&(i=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let a=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,o=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,s=``;e.images.length>1&&(s=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let c=e.videoUrl?`<video class="bl-video" src="${encodeURI(e.videoUrl)}#t=0.1" controls playsinline preload="metadata" aria-label="Video de ${e.imgAlt}"></video>`:``,l=e.hasRating?`
      <div class="pm-rating__stars">${D(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,u=``;return e.optionGroups.length>0&&(u=`
      <div class="pm-options" id="pm-options">
        ${e.optionGroups.map(e=>`
          <fieldset class="pm-option">
            <legend class="pm-option__title">${T(e.name)}</legend>
            <div class="pm-option__chips">
              ${e.values.map(t=>`
                <label class="pm-option__chip${t.is_available?``:` pm-option__chip--out`}">
                  <input type="radio" name="pm-opt-${T(e.id)}" value="${T(t.id)}" ${t.is_available?``:`disabled`} />
                  <span>${T(t.value)}</span>
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
          ${c}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${l}
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

          <!-- Comparador: este mismo producto en otros comercios (price-compare-ui.js) -->
          <div class="pm-compare-slot"></div>

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

          ${u}

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
  `}var z=null,B=null,V=null;function H(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function U(){let e=history.state?.pmDepth||0;e>0?history.go(-e):G()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&(document.getElementById(t)||j({id:t}));n?W(n,{skipHistoryPush:!0}):z&&G()});async function W(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}z&&G(),B=document.activeElement;let n=e.id;t||H(n);let r=document.createElement(`div`);r.className=`product-modal-overlay`,r.id=`pm-overlay`;let i=F(e);r.innerHTML=i?I(i):P(),document.body.appendChild(r),z=r;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),r.offsetHeight,requestAnimationFrame(()=>r.classList.add(`is-open`)),r.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&U()}),V=e=>{e.key===`Escape`&&U()},document.addEventListener(`keydown`,V);let o=A(n);try{let e=await E(n);if(z!==r)return;r.innerHTML=R(e),K(r,e),_(r.querySelector(`.pm-compare-slot`),{productId:e.id,storeId:e.shopId},{onOpen:e=>W(j(e))}).catch(e=>console.warn(`Comparador de la ficha:`,e)),o.then(e=>{z===r&&M(r,e)});let t=r.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),z!==r)return;r.innerHTML=L(),r.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>W(e))}}function G(){if(!z)return;z.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=z;z=null,V&&=(document.removeEventListener(`keydown`,V),null),setTimeout(()=>{e.remove()},400),B&&=(B.focus(),null)}function K(e,t){let a=e.querySelector(`.product-modal`),l=e.querySelector(`#pm-gallery`);l?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||e.target.closest(`.pm-gallery__nav`)||l.classList.toggle(`is-zoomed`)});let u=e.querySelector(`#pm-gallery-img`),_=Array.from(e.querySelectorAll(`.pm-thumb`)),v=0;function y(e){let n=t.images.length;if(n===0)return;v=(e%n+n)%n;let r=t.images[v];u&&r&&(u.src=encodeURI(r)),_.forEach((e,t)=>e.classList.toggle(`is-active`,t===v))}if(_.forEach((e,t)=>{e.addEventListener(`click`,()=>y(t))}),e.querySelector(`#pm-gallery-prev`)?.addEventListener(`click`,()=>y(v-1)),e.querySelector(`#pm-gallery-next`)?.addEventListener(`click`,()=>y(v+1)),t.shopId){let n=()=>{window.location.href=N(t.shopId)},r=e.querySelector(`#pm-shop-link`);r?.addEventListener(`click`,n),r?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),n())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,n)}let x=e.querySelector(`#pm-fav-btn`);if(x&&t.id){let e=x.querySelector(`i`),n=!1;m().then(r=>{n=r.includes(t.id),x.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n)}),x.addEventListener(`click`,async()=>{let r=n;n=!r,x.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n),g(n?`Agregado a favoritos`:`Eliminado de favoritos`,n?`success`:`default`);try{await c(t.id,r)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let S=e.querySelector(`#pm-qty-value`),C=e.querySelector(`#pm-qty-minus`),w=e.querySelector(`#pm-qty-plus`);function T(){let e=parseInt(S.value,10)||1;C.disabled=e<=1,w.disabled=e>=t.stock}C?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e>1&&(S.value=e-1),T()}),w?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e<t.stock&&(S.value=e+1),T()}),S?.addEventListener(`change`,()=>{let e=parseInt(S.value,10)||1;e=Math.max(1,Math.min(e,t.stock)),S.value=e,T()});let E=e.querySelector(`#pm-add-cart`);E?.addEventListener(`click`,()=>{let a=parseInt(S?.value,10)||1,c=p(t.priceOldText),l=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),u=d(t.optionGroups,l);if(u.length>0){g(`Elegí ${u.map(e=>e.toLowerCase()).join(` y `)} antes de agregar al carrito.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let m=i(t.optionGroups,l),_=r(t.id,l),v=s(),y=v.find(e=>n(e)===_);y?(y.qty+=a,y.selected=!0):v.push({id:t.id,name:t.name,shop:t.shop,price:t.price,priceOld:c||null,image:t.imgSrc,qty:a,options:l,optionsLabel:m,selected:!0}),h(v),o(),E.classList.add(`pm-btn--added`);let b=E.innerHTML;E.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{E.classList.remove(`pm-btn--added`),E.innerHTML=b},1800);let x=f(i(t.optionGroups,l));g(`${t.name}${x?` (${x})`:``} agregado al carrito (x${a})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let a=parseInt(S?.value,10)||1,c=p(t.priceOldText),l=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),u=d(t.optionGroups,l);if(u.length>0){g(`Elegí ${u.map(e=>e.toLowerCase()).join(` y `)} antes de comprar.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let f=r(t.id,l),m=s(),_=m.find(e=>n(e)===f);_?(_.qty+=a,_.selected=!0):m.push({id:t.id,name:t.name,shop:t.shop,price:t.price,priceOld:c||null,image:t.imgSrc,qty:a,options:l,optionsLabel:i(t.optionGroups,l),selected:!0}),h(m),o(),G();let v=window.location.pathname.includes(`/pages/`);window.location.href=v?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:t.name,text:`Mirá ${t.name} en Baradero Local por ${t.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),g(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),g(`¡Link copiado!`,`success`)}catch{}}});let D=e.querySelectorAll(`.pm-tab`),O=e.querySelectorAll(`.pm-tab-content`),k=!1;D.forEach(n=>{n.addEventListener(`click`,()=>{D.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),O.forEach(e=>e.classList.remove(`is-visible`)),n.classList.add(`is-active`),n.setAttribute(`aria-selected`,`true`);let r=n.dataset.tab,i=e.querySelector(`[data-tab-content="${r}"]`);if(i&&i.classList.add(`is-visible`),r===`reviews`&&!k){k=!0;let n=e.querySelector(`#pm-reviews-container`);n&&b(n,`product`,t.id,{hideForm:t.isOwner})}})});let A=()=>[...a.querySelectorAll(`button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`)],j=A()[0];a.addEventListener(`keydown`,e=>{if(e.key!==`Tab`)return;let t=A(),n=t[0],r=t[t.length-1];n&&r&&(e.shiftKey?document.activeElement===n&&(e.preventDefault(),r.focus()):document.activeElement===r&&(e.preventDefault(),n.focus()))}),setTimeout(()=>j?.focus(),100)}var q=100,J=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;function Y(e){let t=e.target.closest?.(`.product-card`);return!t||!J.test(t.id)||t.matches(`a[href]`)||e.target.closest(`.product-card__add, .product-card__wishlist`)?null:t}function X(e){let t=null,n=null;e.addEventListener(`pointerover`,e=>{if(e.pointerType!==`mouse`)return;let r=Y(e);r&&r!==n&&(clearTimeout(t),n=r,t=setTimeout(()=>v(r.id),q))}),e.addEventListener(`pointerout`,e=>{n&&(e.relatedTarget&&n.contains(e.relatedTarget)||(clearTimeout(t),n=null))}),e.addEventListener(`pointerdown`,e=>{let t=Y(e);t&&v(t.id)})}function Z(){document.querySelectorAll(`.products__grid`).forEach(e=>{X(e),e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),W(t))})})}typeof window<`u`&&(window.initProductModal=Z,window.openProductModal=W,window.closeProductModal=G);export{w as t};