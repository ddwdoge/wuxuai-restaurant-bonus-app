// Runs unchanged Edge handler bytes with explicit, non-sending runtime adapters.
// This is a Node harness, not evidence of a hosted Deno deployment.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as billing from '../../supabase/functions/_shared/billingArchitecture.mjs';
import * as binding from '../../supabase/functions/_shared/projectBinding.mjs';
import * as redemption from '../../supabase/functions/_shared/redemptionEdgeContract.mjs';

export function loadEdge(name, env, createClient, provider = async()=>{throw Error('NETWORK_FORBIDDEN');}) {
  const source=readFileSync(new URL(`../../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
  let handler;
  const modules={
    'npm:@supabase/supabase-js@2.50.3':{createClient},
    '../_shared/billingArchitecture.mjs':billing,
    '../_shared/projectBinding.mjs':binding,
    '../_shared/redemptionEdgeContract.mjs':redemption,
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:{},require:name=>{if(!modules[name])throw Error('IMPORT_FORBIDDEN');return modules[name];},
    Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn;}},
    Response,Request,TextEncoder,TextDecoder,Uint8Array,URLSearchParams,fetch:provider,
  });
  if(!handler)throw Error('EDGE_HANDLER_MISSING');
  return handler;
}
