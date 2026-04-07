import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import type { RelayDeskStudio } from "../types";

interface SourceEditorViewProps {
  readonly studio: RelayDeskStudio;
}

export function SourceEditorView({ studio }: SourceEditorViewProps) {
  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Text size="3" weight="bold">原始配置草稿</Text>
        <Flex gap="2" wrap="wrap">
          <Button variant="soft" color="gray" size="1" onClick={() => void studio.actions.validateWorkspace()} disabled={studio.snapshot.busy}>校验草稿</Button>
          <Button variant="soft" size="1" onClick={studio.actions.resetRawEditor}>还原草稿</Button>
          <Button variant="soft" size="1" onClick={studio.actions.applyRawEditor}>应用到表单</Button>
          <Button size="1" onClick={() => void studio.actions.saveWorkspace()} disabled={studio.snapshot.busy}>保存到磁盘</Button>
        </Flex>
      </Flex>
      <TextArea
        resize="vertical"
        rows={8}
        style={{ flex: 1, minHeight: 80 }}
        value={studio.snapshot.rawEditor}
        onChange={(event) => studio.actions.setRawEditor(event.target.value)}
      />
    </Flex>
  );
}
