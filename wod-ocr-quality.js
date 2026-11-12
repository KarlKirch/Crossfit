'use strict';
// WOD-piltide OCR-kvaliteedikontroll: suvalist tähemüra ei salvestata.
(function(){
  const exercises=[
    /\b(?:squats?|ohs|pistols?)\b/i,
    /\b(?:deadlifts?|rdl)\b/i,
    /\b(?:burpees?|sprawls?)\b/i,
    /\b(?:snatches?)\b/i,
    /\b(?:cleans?|jerks?)\b/i,
    /\b(?:thrusters?)\b/i,
    /\b(?:push[ -]?ups?|handstand\s+push[ -]?ups?|hspu)\b/i,
    /\b(?:pull[ -]?ups?|chin[ -]?ups?|muscle[ -]?ups?)\b/i,
    /\b(?:press(?:es|ing)?|bench\s+press|push\s+press)\b/i,
    /\b(?:lunges?|step[ -]?ups?)\b/i,
    /\b(?:sit[ -]?ups?|v[ -]?ups?|crunch(?:es)?)\b/i,
    /\b(?:toes[ -]?to[ -]?bar|t2b|ttb)\b/i,
    /\b(?:wall[ -]?balls?|wallballs?)\b/i,
    /\b(?:box[ -]?jumps?|box[ -]?step[ -]?ups?)\b/i,
    /\b(?:double[ -]?unders?|single[ -]?unders?|jump\s+rope)\b/i,
    /\b(?:run|running|jog|jogging|sprints?)\b/i,
    /\b(?:rows?|rower|rowing|erg)\b/i,
    /\b(?:bike|biking|assault\s+bike|airbike)\b/i,
    /\b(?:ski|ski[ -]?erg)\b/i,
    /\b(?:swings?|kettlebells?|dumbbells?|barbell|kb|db)\b/i,
    /\b(?:planks?|hollow\s+hold|superman)\b/i,
    /\b(?:carry|carries|farmer'?s?\s+walk)\b/i,
    /\b(?:bear\s+crawl|shuttle\s+run|rope\s+climb)\b/i,
    /(?:^|\s)(?:kükid?|kükk|jooks|sõudmine|sõud|surumine|tõmbed?|hüpped?|väljaasted?)(?:\s|$)/i
  ];
  const structure=/\b(?:amrap|emom|tabata|for\s+time|rft|rounds?|reps?|sets?|time\s*cap|metcon|warm[ -]?up|strength|skill|finisher|intervals?|every\s+\d+\s*(?:min|minutes?)|\d+\s*x\s*\d+)\b/i;
  function evaluate(raw,confidence){
    const value=String(raw||'').normalize('NFKC').trim();
    const conf=Number(confidence)||0;
    if(conf<45)return {ok:false,reason:'OCR confidence below 45%'};
    if(value.length<8)return {ok:false,reason:'Text too short'};
    const compact=value.replace(/\s/g,'');
    const alphanumeric=(compact.match(/[\p{L}\p{N}]/gu)||[]).length;
    if(!compact.length||alphanumeric/compact.length<.63)
      return {ok:false,reason:'Too many unidentified symbols'};
    const artifacts=(value.match(/[©¢§¤~\\|]/g)||[]).length;
    if(artifacts>=5)return {ok:false,reason:'Repeated OCR artifacts'};
    const exerciseCount=exercises.reduce((n,re)=>n+(re.test(value)?1:0),0);
    const hasStructure=structure.test(value);
    const numeric=/\d/.test(value);
    const words=(value.match(/[\p{L}]{2,}/gu)||[]).length;
    if(exerciseCount===0)return {ok:false,reason:'No recognizable exercises'};
    if(!hasStructure&&!numeric&&exerciseCount<2)
      return {ok:false,reason:'Missing workout structure'};
    if(words>18&&exerciseCount<2&&!hasStructure)
      return {ok:false,reason:'Mostly unrecognized text'};
    if(words>30&&(exerciseCount+(hasStructure?1:0))/words<.075)
      return {ok:false,reason:'Too few recognizable exercise words'};
    return {ok:true,exerciseCount,confidence:conf};
  }
  window.crossfitWodOcrQuality={evaluate};
})();
