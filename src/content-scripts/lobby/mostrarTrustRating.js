import { getFromStorage, setStorage } from '../../lib/storage';
import { getPlayerInfo } from './getPlayerInfo';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

const limparCache = async () => {
  const ultimaLimpeza = await getFromStorage( 'ultimaLimpezaTrustRatingCache' );
  if ( !ultimaLimpeza || ultimaLimpeza < Date.now() - CACHE_TTL ) {
    const cache = await getFromStorage( 'trustRatingCache' ) || {};
    for ( const [ id, obj ] of Object.entries( cache ) ) {
      if ( obj.ttl <= Date.now() ) { delete cache[id]; }
    }
    await setStorage( 'trustRatingCache', cache );
    await setStorage( 'ultimaLimpezaTrustRatingCache', Date.now() );
  }
};

export const getTrustRatingColor = score => {
  if ( score === 100 ) { return '#0df397'; }
  if ( score < 50 ) { return '#eb2f2f'; }
  const hue = Math.round( ( score - 50 ) / 49 * 60 );
  return `hsl(${hue}, 80%, 50%)`;
};

export const fetchTrustRating = async steamId => {
  await limparCache();

  const cache = await getFromStorage( 'trustRatingCache' ) || {};
  if ( cache?.[steamId]?.ttl > Date.now() ) { return cache[steamId].rating; }

  const response = await new Promise( resolve =>
    chrome.runtime.sendMessage( { type: 'FETCH_TRUST_RATING', steamId }, resolve )
  );

  if ( !response?.success ) { return null; }

  const rating = response.data?.result?.trust_rating ?? null;
  cache[steamId] = { rating, ttl: Date.now() + CACHE_TTL };
  await setStorage( 'trustRatingCache', cache );
  return rating;
};

const normalizarTitulo = title => ( title || '' ).trim();

const atualizarMinCsrepPorSala = () => {
  document.querySelectorAll( '#lobbies-wrapper .RoomCardWrapper' ).forEach( room => {
    const badges = room.querySelectorAll( '[data-csrep-score]' );
    const scores = Array.from( badges )
      .map( b => Number( b.getAttribute( 'data-csrep-score' ) ) )
      .filter( s => !isNaN( s ) );

    if ( !scores.length ) { return; }

    const title = room.querySelector( '.LobbyRoom__title' );
    if ( !title ) { return; }

    let el = room.querySelector( '.gcbooster-csrep-media' );
    if ( !el ) {
      el = document.createElement( 'div' );
      el.className = 'gcbooster-csrep-media';
      el.style.display = 'none';
      title.insertAdjacentElement( 'afterend', el );
    }

    el.setAttribute( 'gcbooster_min_csrep', Math.min( ...scores ) );
    el.setAttribute( 'gcbooster_csrep_lobby_title', normalizarTitulo( title.innerText ) );
  } );
};

const obterMinCsrepPorTitulo = title => {
  const els = document.querySelectorAll( '[gcbooster_min_csrep][gcbooster_csrep_lobby_title]' );
  return Array.from( els ).find(
    el => normalizarTitulo( el.getAttribute( 'gcbooster_csrep_lobby_title' ) ) === normalizarTitulo( title )
  );
};

const atualizarCsrepNaListaDesafios = () => {
  const lista = document.querySelector( '.ChallengesList__list' );
  if ( !lista ) { return; }

  lista.querySelectorAll( '.LobbyChallengeCard__item' ).forEach( item => {
    const info = item.querySelector( '.LobbyChallengeCard__info' );
    const titleEl = info?.querySelector( 'p' );
    if ( !titleEl ) { return; }

    const csrepEl = obterMinCsrepPorTitulo( titleEl.textContent );
    if ( !csrepEl ) { return; }

    const min = Math.floor( Number( csrepEl.getAttribute( 'gcbooster_min_csrep' ) ) );
    if ( isNaN( min ) ) { return; }

    const color = getTrustRatingColor( min );

    let span = info.querySelector( '.gcbooster-min-csrep' );
    if ( !span ) {
      span = document.createElement( 'span' );
      span.className = 'gcbooster-min-csrep';
      // flex-basis:100% força nova linha mesmo dentro de flex-row (caso "desafio recomendado")
      span.style.cssText = 'font-size:9px;display:block;flex-basis:100%;width:100%;';
      const wrapper = info.querySelector( '.gcbooster-kdr-wrapper' );
      ( wrapper || info ).appendChild( span );
    }

    span.innerHTML = `min <span style="color:#fff">CS</span><span style="color:#0df397">REP</span>: <span style="color:${color}">${min}%</span>`;
  } );
};

export const mostrarTrustRatingDesafios = () => {
  setInterval( () => {
    getFromStorage( 'mostrarTrustRating', 'sync' ).then( enabled => {
      if ( !enabled ) { return; }
      atualizarMinCsrepPorSala();
      atualizarCsrepNaListaDesafios();
    } );
  }, 1500 );
};

export const showTrustRatingMatch = () => {
  const observer = new MutationObserver( () => {
    $( '[id^="trigger-"]' ).each( ( _, element ) => {
      if ( element.dataset.gcboosterTrustRatingProcessed ) { return; }

      const playerId = element.id.replace( 'trigger-', '' );
      element.dataset.gcboosterTrustRatingProcessed = 'true';

      ( async () => {
        const enabled = await getFromStorage( 'mostrarTrustRating', 'sync' );
        if ( !enabled ) { return; }

        const $playerListCard = $( element ).closest( '.PlayerListCard' );
        const $badges = $playerListCard.find( '.PlayerIdentityBadges' );
        if ( !$badges.length ) { return; }

        if ( $badges.find( `#gcbooster_trustrating_match_${playerId}` ).length ) { return; }

        const badgeStyles = {
          'font-weight': '700',
          'font-size': '10px',
          'padding': '2px 4px',
          'margin-top': '2px',
          'margin-left': '4px',
          'text-align': 'center',
          'display': 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          'line-height': '1.3'
        };

        const $badge = $( '<div/>', {
          'id': `gcbooster_trustrating_match_${playerId}`,
          'css': { ...badgeStyles, 'color': 'rgba(255,255,255,0.15)' }
        } ).html( '<span style="color:rgba(255,255,255,0.15)">CS</span><span style="color:rgba(13,243,151,0.15)">REP</span> —' );

        const isLeftSide = $playerListCard.hasClass( 'PlayerListCard--left' );
        $badges.append( $badge );
        if ( isLeftSide ) {
          $badge.css( 'order', '11' );
        } else {
          $badge.css( { 'order': '-2', 'margin-left': '0', 'margin-right': '4px' } );
        }

        const playerData = await getPlayerInfo( playerId );
        const steamId = playerData?.steamId;
        if ( !steamId ) { return; }

        $badge
          .css( 'cursor', 'pointer' )
          .on( 'click', e => {
            e.preventDefault();
            e.stopPropagation();
            window.open( `https://csrep.gg/player/${steamId}`, '_blank' );
          } );

        const rating = await fetchTrustRating( steamId );
        if ( rating === null || rating === undefined ) { return; }

        const color = getTrustRatingColor( Number( rating ) );
        const score = Math.floor( Number( rating ) );

        $badge
          .css( { ...badgeStyles, 'color': color, 'cursor': 'pointer' } )
          .html( `<span><span style="color:#fff">CS</span><span style="color:#0df397">REP</span></span><span>${score}%</span>` );
      } )();
    } );
  } );

  observer.observe( document.body, { childList: true, subtree: true } );
};

export const mostrarTrustRating = async mutations => {
  const enabled = await getFromStorage( 'mostrarTrustRating', 'sync' );
  if ( !enabled ) { return; }

  $.each( mutations, async ( _, mutation ) => {
    $( mutation.addedNodes )
      .find( 'a.LobbyPlayerVertical' )
      .addBack( 'a.LobbyPlayerVertical' )
      .each( async ( _, element ) => {
        const $element = $( element );

        if ( $element.find( 'div.PlayerPlaceholder' ).length > 0 ) { return; }
        if ( $element.find( '#gcbooster_trustrating' ).length ) { return; }

        const gcPlayerId = ( $element.attr( 'href' ) || '' ).split( '/' ).pop();
        if ( !gcPlayerId ) { return; }

        const badgeStyles = {
          'margin-bottom': '2px',
          'margin-top': '2px',
          'width': '100%',
          'padding': '2px 4px',
          'text-align': 'center',
          'font-weight': '700',
          'background-color': 'rgba(10,12,16,0.82)',
          'font-size': '10px',
          'line-height': '1.4'
        };

        const $badge = $( '<div/>', { 'id': 'gcbooster_trustrating', 'css': { ...badgeStyles, 'color': 'rgba(255,255,255,0.15)' } } )
          .html( '<span style="color:rgba(255,255,255,0.15)">CS</span><span style="color:rgba(13,243,151,0.15)">REP</span> —' );

        const $kdrBadge = $element.find( '#gcbooster_kdr' );
        if ( $kdrBadge.length ) {
          $kdrBadge.after( $badge );
        } else {
          $element.prepend( $badge );
        }

        const playerData = await getPlayerInfo( gcPlayerId );
        const steamId = playerData?.steamId;
        if ( !steamId ) { return; }

        $badge
          .css( 'cursor', 'pointer' )
          .on( 'click', e => {
            e.preventDefault();
            e.stopPropagation();
            window.open( `https://csrep.gg/player/${steamId}`, '_blank' );
          } );

        const rating = await fetchTrustRating( steamId );
        if ( rating === null || rating === undefined ) { return; }

        const color = getTrustRatingColor( Number( rating ) );
        const score = Math.floor( Number( rating ) );

        $badge
          .attr( 'data-csrep-score', score )
          .css( { ...badgeStyles, 'color': color, 'cursor': 'pointer' } )
          .html( `<span style="color:#fff">CS</span><span style="color:#0df397">REP</span> ${score}%` );
      } );
  } );
};
