// Parse and summarize the 77 approving processes
const fs = require('fs');

// Read the raw JSON file (note: it contains JS Date objects, so we need to handle that)
let raw = fs.readFileSync('E:/workbuddy/Claw/.workbuddy/bpm_output/my_applying_requests.json', 'utf8');

// Convert JS Date objects to parseable format
raw = raw.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, '"$1-$2-$3 $4:$5:$6"');

const data = JSON.parse(raw);
const tasks = data.children;

// Group by current approver
const byApprover = {};
const byStep = {};

tasks.forEach(t => {
  const children = t.State?.children || [];
  const approvers = children.map(c => `${c.RecipientDisplayName}(${c.RecipientAccount})`).join(', ');
  const steps = children.map(c => c.StepName).join(', ');

  if (!byApprover[approvers]) byApprover[approvers] = [];
  byApprover[approvers].push(t);

  if (!byStep[steps]) byStep[steps] = [];
  byStep[steps].push(t);
});

// Print summary by approver
console.log('=== 按当前审批人分组 ===\n');
Object.keys(byApprover).sort((a, b) => byApprover[b].length - byApprover[a].length).forEach(approver => {
  console.log(`\n【${approver}】共 ${byApprover[approver].length} 条`);

  // Group within approver by step name
  const stepGroups = {};
  byApprover[approver].forEach(t => {
    const step = t.State.children.map(c => c.StepName).join(', ');
    if (!stepGroups[step]) stepGroups[step] = [];
    stepGroups[step].push(t);
  });

  Object.keys(stepGroups).forEach(step => {
    console.log(`  └─ ${step} (${stepGroups[step].length}条)`);
    stepGroups[step].forEach(t => {
      const date = t.CreateAt.split(' ')[0];
      console.log(`     • [${date}] ${t.SerialNum} | ${t.ProcessName} | ${t.Description}`);
    });
  });
});

console.log('\n\n=== 需要您本人操作的流程 ===\n');
const myAction = tasks.filter(t => {
  return t.State.children.some(c => c.RecipientAccount === 'chenjialin3');
});
myAction.forEach(t => {
  const step = t.State.children.map(c => c.StepName).join(', ');
  const date = t.CreateAt.split(' ')[0];
  console.log(`  ⚠️ [${date}] ${t.SerialNum} | ${t.ProcessName} | 当前节点: ${step} | ${t.Description}`);
});

console.log(`\n\n总计: ${tasks.length} 条审批中的流程`);
