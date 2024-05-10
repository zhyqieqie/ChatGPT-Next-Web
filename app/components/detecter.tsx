/* eslint-disable @next/next/no-img-element */
import { ChatMessage, ModelType, useAppConfig, useChatStore } from "../store";
import Locale from "../locales";
import styles from "./detecter.module.scss";
import {
  List,
  ListItem,
  Modal,
  Select,
  showImageModal,
  showModal,
  showToast,
} from "./ui-lib";
import { IconButton } from "./button";
import {
  copyToClipboard,
  downloadAs,
  getMessageImages,
  useMobileScreen,
} from "../utils";

import CopyIcon from "../icons/copy.svg";
import LoadingIcon from "../icons/three-dots.svg";
import ChatGptIcon from "../icons/chatgpt.png";
import OKIcon from "../icons/OK.png";
import ShareIcon from "../icons/share.svg";
import BotIcon from "../icons/bot.png";

import DownloadIcon from "../icons/download.svg";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSelector, useMessageSelector } from "./message-selector";
import { Avatar } from "./emoji";
import dynamic from "next/dynamic";
import NextImage from "next/image";

import { toBlob, toPng } from "html-to-image";
import { DEFAULT_MASK_AVATAR } from "../store/mask";

import { prettyObject } from "../utils/format";
import { EXPORT_MESSAGE_CLASS_NAME, ModelProvider } from "../constant";
import { getClientConfig } from "../config/client";
import { ClientApi } from "../client/api";
import { getMessageTextContent } from "../utils";
import { identifyDefaultClaudeModel } from "../utils/checkers";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

let title = "一场龙争虎斗的激烈篮球赛";
let content =
  "一场别树一格的赛事让无数运动爱好者血脉贲张,尤其是吾辈同袍,更是观摩津津乐道。你猜猜看,究竟是哪两支劲旅在绿茵场上展开了一场龙争虎斗?莫急,姑且为你娓娓道来。";
/*let detectResult = {
  "baidu": "-",
  "_360": "-",
  "score": "-"
};
let risk1Result = {
  "rtype": "1",
  "action": "",
  "labelsList": []
};
let risk2Result = {
  "rtype": "2",
  "action": "",
  "labelsList": []
};
let analysisTitleResult = {
  "emotion": "-",
  "titlesection": "",
  "category1": "",
  "title": ""
};
let extractLabelResult = {
  "labelinfo":{
    "title":"",
    "labels":[{"score":"","tag":""}]},
  "category":"体育"
};*/

let token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiJhODY5YTkwNS0zZWQ5LTRjNDktYTMxYi04ODhjZmNlNzEzZTgiLCJUaW1lU3BhbiI6IjIwMjQwNTA4MTExNjM0IiwibmJmIjoxNzE1MTM4MTk0LCJleHAiOjE3MTc3MzAxOTQsImlzcyI6Ill6T3BlbiIsImF1ZCI6Ill6T3BlbiJ9.j6_VTF29sK5vS90FBGG6jsCR6Dfg2r2DNjL_IUi_Oco";
//let analysisUrl = "https://a.lvpao.run/a/article/articleyizhuan/analysis";
let analysisUrl = "http://localhost:9300/a/article/articleyizhuan/analysis";
export function DetectMessageModal(props: { onClose: () => void }) {
  return (
    <div className="modal-mask">
      <Modal
        title="一键检测"
        onClose={props.onClose}
        footer={
          <div
            style={{
              width: "100%",
              textAlign: "center",
              fontSize: 14,
              opacity: 0.5,
            }}
          ></div>
        }
        defaultMax={true}
      >
        <div style={{ minHeight: "40vh" }}>
          <OriginalDetect />
        </div>
      </Modal>
    </div>
  );
}

function useSteps(
  steps: Array<{
    name: string;
    value: string;
  }>,
) {
  const stepCount = steps.length;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const nextStep = () =>
    setCurrentStepIndex((currentStepIndex + 1) % stepCount);
  const prevStep = () =>
    setCurrentStepIndex((currentStepIndex - 1 + stepCount) % stepCount);

  return {
    currentStepIndex,
    setCurrentStepIndex,
    nextStep,
    prevStep,
    currentStep: steps[currentStepIndex],
  };
}

function Steps<
  T extends {
    name: string;
    value: string;
  }[],
>(props: { steps: T; onStepChange?: (index: number) => void; index: number }) {
  const steps = props.steps;
  const stepCount = steps.length;

  return (
    <div className={styles["steps"]}>
      <div className={styles["steps-progress"]}>
        <div
          className={styles["steps-progress-inner"]}
          style={{
            width: `${((props.index + 1) / stepCount) * 100}%`,
          }}
        ></div>
      </div>
      <div className={styles["steps-inner"]}>
        {steps.map((step, i) => {
          return (
            <div
              key={i}
              className={`${styles["step"]} ${
                styles[i <= props.index ? "step-finished" : ""]
              } ${i === props.index && styles["step-current"]} clickable`}
              onClick={() => {
                props.onStepChange?.(i);
              }}
              role="button"
            >
              <span className={styles["step-index"]}>{i + 1}</span>
              <span className={styles["step-name"]}>{step.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OriginalDetect() {
  const steps = [
    {
      name: "原创检测",
      value: "detect",
    },
    {
      name: "风险检测",
      value: "risk",
    },
    {
      name: "标题分析",
      value: "title",
    },
    {
      name: "提取文章标题",
      value: "title",
    },
    /*{
      name: "其他检测",
      value: "preview",
    },*/
  ];
  const { currentStep, setCurrentStepIndex, currentStepIndex } =
    useSteps(steps);
  const formats = ["text", "image", "json"] as const;
  type ExportFormat = (typeof formats)[number];
  const config = useAppConfig();
  const [exportConfig, setExportConfig] = useState({
    format: "image" as ExportFormat,
    includeContext: true,
  });
  const [loading, setLoading] = useState(false);

  const [score, setScore] = useState({
    score: "",
    _360: "",
    baidu: "",
  });

  const [risk1, setRisk1] = useState({
    rtype: "",
    action: "",
    labelsList: [],
  });

  const [risk2, setRisk2] = useState({
    rtype: "",
    action: "",
    labelsList: [],
  });

  const [analysisTitle, setAnalysisTitle] = useState({
    emotion: "",
    titlesection: false,
    category1: "",
    title: "",
  });

  const [extractLabel, setExtractLabel] = useState({
    labelinfo: {
      title: "",
      labels: [{ score: "", tag: "" }], // 或者初始化为空数组的具体对象结构 [{score:"", tag:""}]
    },
    category: "",
  });
  function updateExportConfig(updater: (config: typeof exportConfig) => void) {
    const config = { ...exportConfig };
    updater(config);
    setExportConfig(config);
  }

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { selection, updateSelection } = useMessageSelector();
  const selectedMessages = useMemo(() => {
    const ret: ChatMessage[] = [];
    if (exportConfig.includeContext) {
      ret.push(...session.mask.context);
    }
    ret.push(...session.messages.filter((m) => selection.has(m.id)));
    return ret;
  }, [
    exportConfig.includeContext,
    session.messages,
    session.mask.context,
    selection,
  ]);
  function preview() {
    if (exportConfig.format === "text") {
      return (
        <MarkdownPreviewer messages={selectedMessages} topic={session.topic} />
      );
    } else if (exportConfig.format === "json") {
      return (
        <JsonPreviewer messages={selectedMessages} topic={session.topic} />
      );
    } else {
      return (
        <ImagePreviewer messages={selectedMessages} topic={session.topic} />
      );
    }
  }
  // 从消息队列中获取这条记录
  let userMessage = session.mask.context.pop();
  if (userMessage) {
    const textContent = userMessage.content;
    if (typeof textContent === "string") {
      const lines = textContent.split("\n");
      title = lines[0];
      content = lines.slice(1).join("\n");
    }
  }
  //const { baidu,_360,score } = detectResult;
  useEffect(() => {
    console.log("11111");
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      setLoading(true);
      console.log("222222");
      /*const response = await fetch(analysisUrl, {
        body: JSON.stringify({
          title: title,
          content: content,
        }),
        headers: {
          "Content-Type": "application/json",
          "token": token
        },
        method: "POST"
      });
      const data = await response.json();*/
      const jsonString =
        '{"code":0,"msg":"成功","data":{"score":{"score":"80.92","_360":"-","baidu":"80.92"},"risk2":{"rtype":"2","action":"1","labelsList":[{"level":"1","hint":"破局","label":"400"}]},"risk1":{"rtype":"1","action":"1","labelsList":[{"level":"1","hint":"破局","label":"400"}]},"analysisTitle":{"emotion":"中性","titlesection":"true","category1":"科技","title":"标题:国产旗舰手机 破局征程"},"extractLabel":{"labelinfo":{"title":"标题:国产旗舰手机 破局征程","labels":[{"score":"1.65409","tag":"高端旗舰"},{"score":"1.13363","tag":"华为"},{"score":"1.04158","tag":"小米"},{"score":"0.99395","tag":"国产"},{"score":"0.9321","tag":"国产手机"}]},"category":"科技"}}}';
      const data = JSON.parse(jsonString);
      console.log("易撰返回：", JSON.stringify(data));
      if (data && data.data && data.data.risk1) {
        console.log("风险类型1:", data.data.risk1);
        setRisk1(data.data.risk1);
        console.log("风险类型1:", JSON.stringify(risk1));
      }
      if (data && data.data && data.data.risk2) {
        setRisk2(data.data.risk2);
        console.log("风险类型2:", risk2);
      }
      if (data && data.data && data.data.score) {
        setScore(data.data.score);
        console.log("文章评分:", score);
      }
      if (data && data.data && data.data.analysisTitle) {
        setAnalysisTitle(data.data.analysisTitle);
        console.log("文章标题分析:", analysisTitle);
      }
      if (data && data.data && data.data.extractLabel) {
        setExtractLabel(data.data.extractLabel);
        console.log("文章标签:", extractLabel);
      }
      //detectResult = data.data.score;

      /*const labels = data.data.extractLabel.labelinfo.labels;
      labels.forEach((label: { tag: any; score: any; }) => {
        console.log(`标签: ${label.tag}, 得分: ${label.score}`);
      });*/

      showToast("检测完成");
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  console.log("detectResult=", score);
  console.log("baidu=", score.baidu);
  console.log("_360=", score._360);
  console.log("score=", score.score);
  return (
    <>
      <List>
        <ListItem className={styles["original-result-value"]} title="标题：">
          <span>{analysisTitle.title}</span>
        </ListItem>
        <ListItem
          className={styles["original-result-value"]}
          title="风险检测："
        >
          <span>{risk1.action}</span>
        </ListItem>
        <ListItem
          className={styles["original-result-value"]}
          title="原创分值："
        >
          <span>{score.score}</span>
        </ListItem>
        <ListItem
          className={styles["original-result-value"]}
          title="标题分析："
        >
          <span>{score.score}</span>
        </ListItem>
        <ListItem
          className={styles["original-result-value"]}
          title="文章标签/领域："
        >
          <span>{extractLabel.category}</span>
        </ListItem>
      </List>
      <Steps
        steps={steps}
        index={currentStepIndex}
        onStepChange={setCurrentStepIndex}
      />
      {/*原创检测过程*/}
      <div className={styles["original-detect-wrap"]}>
        <div className={styles["original-detect-item"]}>
          <NextImage src={OKIcon.src} alt="logo" width={25} height={25} />
          <div className={styles["original-detect-item-provide"]}>
            经baidu原创检测得分：
          </div>
          <div className={styles["original-detect-item-score"]}>
            {score.baidu}
          </div>
        </div>
        <div className={styles["original-detect-item"]}>
          <NextImage src={OKIcon.src} alt="logo" width={25} height={25} />
          <div className={styles["original-detect-item-provide"]}>
            经360原创检测得分：
          </div>
          <div className={styles["original-detect-item-score"]}>
            {score._360}
          </div>
        </div>
        <div className={styles["original-detect-item"]}>
          <NextImage src={OKIcon.src} alt="logo" width={25} height={25} />
          <div className={styles["original-detect-item-provide"]}>
            综合原创检测得分：
          </div>
          <div className={styles["original-detect-item-score"]}>
            {score.score}
          </div>
        </div>
      </div>

      <div
        className={styles["message-exporter-body"]}
        style={currentStep.value !== "detect" ? { display: "none" } : {}}
      ></div>
      {currentStep.value === "preview" && (
        <div className={styles["message-exporter-body"]}>{preview()}</div>
      )}
    </>
  );
}

export function RenderExport(props: {
  messages: ChatMessage[];
  onRender: (messages: ChatMessage[]) => void;
}) {
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!domRef.current) return;
    const dom = domRef.current;
    const messages = Array.from(
      dom.getElementsByClassName(EXPORT_MESSAGE_CLASS_NAME),
    );

    if (messages.length !== props.messages.length) {
      return;
    }

    const renderMsgs = messages.map((v, i) => {
      const [role, _] = v.id.split(":");
      return {
        id: i.toString(),
        role: role as any,
        content: role === "user" ? v.textContent ?? "" : v.innerHTML,
        date: "",
      };
    });

    props.onRender(renderMsgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={domRef}>
      {props.messages.map((m, i) => (
        <div
          key={i}
          id={`${m.role}:${i}`}
          className={EXPORT_MESSAGE_CLASS_NAME}
        >
          <Markdown content={getMessageTextContent(m)} defaultShow />
        </div>
      ))}
    </div>
  );
}

export function PreviewActions(props: {
  download: () => void;
  copy: () => void;
  showCopy?: boolean;
  messages?: ChatMessage[];
}) {
  const [loading, setLoading] = useState(false);
  const [shouldExport, setShouldExport] = useState(false);
  const config = useAppConfig();
  const onRenderMsgs = (msgs: ChatMessage[]) => {
    setShouldExport(false);

    var api: ClientApi;
    if (config.modelConfig.model.startsWith("gemini")) {
      api = new ClientApi(ModelProvider.GeminiPro);
    } else if (identifyDefaultClaudeModel(config.modelConfig.model)) {
      api = new ClientApi(ModelProvider.Claude);
    } else {
      api = new ClientApi(ModelProvider.GPT);
    }

    api
      .share(msgs)
      .then((res) => {
        if (!res) return;
        showModal({
          title: Locale.Export.Share,
          children: [
            <input
              type="text"
              value={res}
              key="input"
              style={{
                width: "100%",
                maxWidth: "unset",
              }}
              readOnly
              onClick={(e) => e.currentTarget.select()}
            ></input>,
          ],
          actions: [
            <IconButton
              icon={<CopyIcon />}
              text={Locale.Chat.Actions.Copy}
              key="copy"
              onClick={() => copyToClipboard(res)}
            />,
          ],
        });
        setTimeout(() => {
          window.open(res, "_blank");
        }, 800);
      })
      .catch((e) => {
        console.error("[Share]", e);
        showToast(prettyObject(e));
      })
      .finally(() => setLoading(false));
  };

  const share = async () => {
    if (props.messages?.length) {
      setLoading(true);
      setShouldExport(true);
    }
  };

  return (
    <>
      <div className={styles["preview-actions"]}>
        {props.showCopy && (
          <IconButton
            text={Locale.Export.Copy}
            bordered
            shadow
            icon={<CopyIcon />}
            onClick={props.copy}
          ></IconButton>
        )}
        <IconButton
          text={Locale.Export.Download}
          bordered
          shadow
          icon={<DownloadIcon />}
          onClick={props.download}
        ></IconButton>
        <IconButton
          text={Locale.Export.Share}
          bordered
          shadow
          icon={loading ? <LoadingIcon /> : <ShareIcon />}
          onClick={share}
        ></IconButton>
      </div>
      <div
        style={{
          position: "fixed",
          right: "200vw",
          pointerEvents: "none",
        }}
      >
        {shouldExport && (
          <RenderExport
            messages={props.messages ?? []}
            onRender={onRenderMsgs}
          />
        )}
      </div>
    </>
  );
}

function ExportAvatar(props: { avatar: string }) {
  if (props.avatar === DEFAULT_MASK_AVATAR) {
    return (
      <img
        src={BotIcon.src}
        width={30}
        height={30}
        alt="bot"
        className="user-avatar"
      />
    );
  }

  return <Avatar avatar={props.avatar} />;
}

export function ImagePreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const mask = session.mask;
  const config = useAppConfig();

  const previewRef = useRef<HTMLDivElement>(null);

  const copy = () => {
    showToast(Locale.Export.Image.Toast);
    const dom = previewRef.current;
    if (!dom) return;
    toBlob(dom).then((blob) => {
      if (!blob) return;
      try {
        navigator.clipboard
          .write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ])
          .then(() => {
            showToast(Locale.Copy.Success);
            refreshPreview();
          });
      } catch (e) {
        console.error("[Copy Image] ", e);
        showToast(Locale.Copy.Failed);
      }
    });
  };

  const isMobile = useMobileScreen();

  const download = async () => {
    showToast(Locale.Export.Image.Toast);
    const dom = previewRef.current;
    if (!dom) return;

    const isApp = getClientConfig()?.isApp;

    try {
      const blob = await toPng(dom);
      if (!blob) return;

      if (isMobile || (isApp && window.__TAURI__)) {
        if (isApp && window.__TAURI__) {
          const result = await window.__TAURI__.dialog.save({
            defaultPath: `${props.topic}.png`,
            filters: [
              {
                name: "PNG Files",
                extensions: ["png"],
              },
              {
                name: "All Files",
                extensions: ["*"],
              },
            ],
          });

          if (result !== null) {
            const response = await fetch(blob);
            const buffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            await window.__TAURI__.fs.writeBinaryFile(result, uint8Array);
            showToast(Locale.Download.Success);
          } else {
            showToast(Locale.Download.Failed);
          }
        } else {
          showImageModal(blob);
        }
      } else {
        const link = document.createElement("a");
        link.download = `${props.topic}.png`;
        link.href = blob;
        link.click();
        refreshPreview();
      }
    } catch (error) {
      showToast(Locale.Download.Failed);
    }
  };

  const refreshPreview = () => {
    const dom = previewRef.current;
    if (dom) {
      dom.innerHTML = dom.innerHTML; // Refresh the content of the preview by resetting its HTML for fix a bug glitching
    }
  };

  return (
    <div className={styles["image-previewer"]}>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={!isMobile}
        messages={props.messages}
      />
      <div
        className={`${styles["preview-body"]} ${styles["default-theme"]}`}
        ref={previewRef}
      >
        <div className={styles["chat-info"]}>
          <div className={styles["logo"] + " no-dark"}>
            <NextImage
              src={ChatGptIcon.src}
              alt="logo"
              width={50}
              height={50}
            />
          </div>

          <div>
            <div className={styles["main-title"]}>NextChat</div>
            <div className={styles["sub-title"]}>
              github.com/Yidadaa/ChatGPT-Next-Web
            </div>
            <div className={styles["icons"]}>
              <ExportAvatar avatar={config.avatar} />
              <span className={styles["icon-space"]}>&</span>
              <ExportAvatar avatar={mask.avatar} />
            </div>
          </div>
          <div>
            <div className={styles["chat-info-item"]}>
              {Locale.Exporter.Model}: {mask.modelConfig.model}
            </div>
            <div className={styles["chat-info-item"]}>
              {Locale.Exporter.Messages}: {props.messages.length}
            </div>
            <div className={styles["chat-info-item"]}>
              {Locale.Exporter.Topic}: {session.topic}
            </div>
            <div className={styles["chat-info-item"]}>
              {Locale.Exporter.Time}:{" "}
              {new Date(
                props.messages.at(-1)?.date ?? Date.now(),
              ).toLocaleString()}
            </div>
          </div>
        </div>
        {props.messages.map((m, i) => {
          return (
            <div
              className={styles["message"] + " " + styles["message-" + m.role]}
              key={i}
            >
              <div className={styles["avatar"]}>
                <ExportAvatar
                  avatar={m.role === "user" ? config.avatar : mask.avatar}
                />
              </div>

              <div className={styles["body"]}>
                <Markdown
                  content={getMessageTextContent(m)}
                  fontSize={config.fontSize}
                  defaultShow
                />
                {getMessageImages(m).length == 1 && (
                  <img
                    key={i}
                    src={getMessageImages(m)[0]}
                    alt="message"
                    className={styles["message-image"]}
                  />
                )}
                {getMessageImages(m).length > 1 && (
                  <div
                    className={styles["message-images"]}
                    style={
                      {
                        "--image-count": getMessageImages(m).length,
                      } as React.CSSProperties
                    }
                  >
                    {getMessageImages(m).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt="message"
                        className={styles["message-image-multi"]}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarkdownPreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const mdText =
    `# ${props.topic}\n\n` +
    props.messages
      .map((m) => {
        return m.role === "user"
          ? `## ${Locale.Export.MessageFromYou}:\n${getMessageTextContent(m)}`
          : `## ${Locale.Export.MessageFromChatGPT}:\n${getMessageTextContent(
              m,
            ).trim()}`;
      })
      .join("\n\n");

  const copy = () => {
    copyToClipboard(mdText);
  };
  const download = () => {
    downloadAs(mdText, `${props.topic}.md`);
  };
  return (
    <>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={true}
        messages={props.messages}
      />
      <div className="markdown-body">
        <pre className={styles["export-content"]}>{mdText}</pre>
      </div>
    </>
  );
}

export function JsonPreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const msgs = {
    messages: [
      {
        role: "system",
        content: `${Locale.FineTuned.Sysmessage} ${props.topic}`,
      },
      ...props.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  };
  const mdText = "```json\n" + JSON.stringify(msgs, null, 2) + "\n```";
  const minifiedJson = JSON.stringify(msgs);

  const copy = () => {
    copyToClipboard(minifiedJson);
  };
  const download = () => {
    downloadAs(JSON.stringify(msgs), `${props.topic}.json`);
  };

  return (
    <>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={false}
        messages={props.messages}
      />
      <div className="markdown-body" onClick={copy}>
        <Markdown content={mdText} />
      </div>
    </>
  );
}
