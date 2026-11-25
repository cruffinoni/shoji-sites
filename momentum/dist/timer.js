(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PomodoroTimer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DEFAULT_CONFIG=Object.freeze({workMinutes:25,shortBreakMinutes:5,longBreakMinutes:15,longBreakInterval:4});
  const LIMITS={workMinutes:[1,180],shortBreakMinutes:[1,180],longBreakMinutes:[1,180],longBreakInterval:[1,12]};
  function validateConfig(value){
    const config={};let valid=!!value&&typeof value==='object';
    for(const [key,[min,max]] of Object.entries(LIMITS)){
      const n=Number(value?.[key]);config[key]=n;
      if(!Number.isInteger(n)||n<min||n>max)valid=false;
    }
    return {valid,config:valid?config:{...DEFAULT_CONFIG}};
  }
  const createState=()=>({phase:'work',status:'idle',startedAt:null,endsAt:null,remainingMs:null,completedWork:0,taskId:null});
  function normalize(state){
    const phases=['work','short','long'],statuses=['idle','running','paused','finished'];
    const phase=phases.includes(state?.phase)?state.phase:'work';
    const completedWork=Number.isInteger(state?.completedWork)&&state.completedWork>=0?state.completedWork:0;
    const safeIdle={...createState(),phase,completedWork};
    if(!statuses.includes(state?.status))return safeIdle;
    const startedAt=Number.isFinite(state.startedAt)?state.startedAt:null;
    const endsAt=Number.isFinite(state.endsAt)?state.endsAt:null;
    const remainingMs=Number.isFinite(state.remainingMs)&&state.remainingMs>=0?state.remainingMs:null;
    if(state.status==='running'&&(startedAt===null||endsAt===null||endsAt<=startedAt))return safeIdle;
    if(state.status==='paused'&&remainingMs===null)return safeIdle;
    return {phase,status:state.status,startedAt,endsAt,remainingMs,completedWork,taskId:phase==='work'&&typeof state.taskId==='string'?state.taskId:null};
  }
  function durationMs(phase,config){const key=phase==='work'?'workMinutes':phase==='short'?'shortBreakMinutes':'longBreakMinutes';return config[key]*60_000;}
  function remainingMs(state,now=Date.now()){
    if(state.status==='running')return Math.max(0,state.endsAt-now);
    if(state.status==='paused')return Math.max(0,state.remainingMs||0);
    if(state.status==='finished')return 0;
    return state.remainingMs??null;
  }
  function start(input,{now=Date.now(),config=DEFAULT_CONFIG,selectedTaskId=null}={}){
    const state=normalize(input);if(!['idle','paused'].includes(state.status))return state;
    const left=state.status==='paused'?state.remainingMs:durationMs(state.phase,config);
    return {...state,status:'running',startedAt:now,endsAt:now+left,remainingMs:null,taskId:state.status==='paused'?state.taskId:state.phase==='work'&&typeof selectedTaskId==='string'?selectedTaskId:null};
  }
  function pause(input,now=Date.now()){
    const state=recover(input,now);if(state.status!=='running')return state;
    const left=remainingMs(state,now);return {...state,status:'paused',startedAt:null,endsAt:null,remainingMs:left};
  }
  function resume(input,now=Date.now()){
    const state=normalize(input);if(state.status!=='paused')return state;
    return {...state,status:'running',startedAt:now,endsAt:now+state.remainingMs,remainingMs:null};
  }
  function reset(input){const state=normalize(input);return {...createState(),phase:state.phase,completedWork:state.completedWork};}
  function recover(input,now=Date.now()){
    const state=normalize(input);
    if(state.status==='running'&&state.endsAt!==null&&now>=state.endsAt){
      return {...state,status:'finished',startedAt:null,endsAt:null,remainingMs:0,completedWork:state.completedWork+(state.phase==='work'?1:0)};
    }
    return state;
  }
  function nextPhase(input,config=DEFAULT_CONFIG){
    const state=normalize(input);if(!['finished','idle'].includes(state.status))return state;
    let phase='work';
    if(state.phase==='work')phase=state.completedWork>0&&state.completedWork%config.longBreakInterval===0?'long':'short';
    return {...state,phase,status:'idle',startedAt:null,endsAt:null,remainingMs:null,taskId:null};
  }
  function serialize({state,config}){return JSON.stringify({version:1,state:normalize(state),config:validateConfig(config).config});}
  function deserialize(raw,now=Date.now()){
    try{const data=JSON.parse(raw);const config=validateConfig(data?.config);if(data?.version!==1||!config.valid)return {state:createState(),config:{...DEFAULT_CONFIG}};return {state:recover(normalize(data.state),now),config:config.config};}
    catch(_){return {state:createState(),config:{...DEFAULT_CONFIG}};}
  }
  return {DEFAULT_CONFIG,validateConfig,createState,remainingMs,start,pause,resume,reset,recover,nextPhase,serialize,deserialize};
});
