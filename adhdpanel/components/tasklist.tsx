import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ApolloClient, InMemoryCache, gql, useMutation, useQuery } from '@apollo/client';
import { loadErrorMessages, loadDevMessages } from "@apollo/client/dev";
import { Picker } from '@react-native-picker/picker';
import AGiXTSDK from "agixt";

const AGIXT_API_URI_KEY = "agixtapi";
const AGIXT_API_KEY_KEY = "agixtkey";
const ALWAYS_USE_AGENT_KEY = "alwaysUseAgent";

async function getSubtasks(taskDescription, taskName, taskDetails, agixtApiUri, agixtApiKey) {
  try {
    const agixt = new AGiXTSDK({
      baseUri: agixtApiUri,
      apiKey: agixtApiKey,
    });

    const prompt = await agixt.getPrompt('Get Task List');
    const userInput = `Task Name: ${taskName}\nTask Description: ${taskDescription}\nTask Details: ${JSON.stringify(taskDetails)}`;
    const subtaskResponse = await agixt.promptAgent(ALWAYS_USE_AGENT_KEY, 'Get Task List', {
      user_input: userInput,
    });

    const subtasks = parseTaskDescription(subtaskResponse);
    return subtasks;
  } catch (error) {
    console.error("Error getting subtasks:", error);
    return [];
  }
}

function parseTaskDescription(taskDescription) {
  const sections = taskDescription.split('\n\n');
  const subtasks = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (section.startsWith(`**Task ${i + 1}:`)) {
      const subtaskTitle = section.split(': ').trim();
      let subtaskDescription = '';
      let j = i + 1;
      while (j < sections.length && !sections[j].startsWith(`**Task ${j + 1}:`)) {
        subtaskDescription += sections[j].trim() + '\n';
        j++;
      }
      subtasks.push({
        number: i + 1,
        title: subtaskTitle,
        description: subtaskDescription.trim(),
      });
      i = j - 1;
    }
  }

  return subtasks;
}

const AGiXTComponent = ({ agixtApiUri, agixtApiKey, onSelect }) => {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [alwaysUseAgent, setAlwaysUseAgent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAgents = async () => {
      setIsLoading(true);
      try {
        const agixt = new AGiXTSDK({
          baseUri: agixtApiUri,
          apiKey: agixtApiKey,
        });
  
        const agentsData = await agixt.getAgents();
        const agentsArray = Array.isArray(agentsData) 
          ? agentsData 
          : Object.keys(agentsData).map(name => ({ name, ...agentsData[name] }));
        
        setAgents(agentsArray);
        setSelectedAgent(agentsArray.length > 0 ? agentsArray[0].name : "");
  
        const storedAlwaysUseAgent = await AsyncStorage.getItem(ALWAYS_USE_AGENT_KEY);
        if (storedAlwaysUseAgent !== null) {
          setAlwaysUseAgent(JSON.parse(storedAlwaysUseAgent));
        }
  
        setError(null);
      } catch (error) {
        console.error("Error fetching agents:", error);
        setError("Failed to fetch agents. Please check your API settings.");
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchAgents();
  }, [agixtApiUri, agixtApiKey]);

  const handleAlwaysUseAgentChange = async () => {
    const newValue = !alwaysUseAgent;
    setAlwaysUseAgent(newValue);
    await AsyncStorage.setItem(ALWAYS_USE_AGENT_KEY, JSON.stringify(newValue));
  };

  const handleOk = () => {
    onSelect(selectedAgent, alwaysUseAgent);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading agents...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.agixtComponentContainer}>
      {agents.length > 0 ? (
        <View style={styles.agentsContainer}>
          <Text style={styles.agentsLabel}>Select an Agent:</Text>
          <Picker
            selectedValue={selectedAgent}
            onValueChange={setSelectedAgent}
            style={styles.agentPicker}
          >
            {agents.map((agent) => (
              <Picker.Item key={agent.name} label={agent.name} value={agent.name} />
            ))}
          </Picker>
          <View style={styles.alwaysUseAgentContainer}>
            <Text style={styles.alwaysUseAgentLabel}>Always use this agent:</Text>
            <TouchableOpacity
              style={[
                styles.alwaysUseAgentCheckbox,
                alwaysUseAgent && styles.alwaysUseAgentChecked,
              ]}
              onPress={handleAlwaysUseAgentChange}
            >
              {alwaysUseAgent && <Text style={styles.alwaysUseAgentCheckboxText}>✓</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.okButton} onPress={handleOk}>
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.noAgentsText}>No agents available</Text>
      )}
    </View>
  );
};

if (__DEV__) {
  loadDevMessages();
  loadErrorMessages();
}

const GET_USER_REPOSITORIES = gql`
  query getRepositories($username: String!) {
    user(login: $username) {
      repositories(first: 10) {
        nodes {
          name
          description
          url
        }
      }
    }
  }
`;

export default function TaskPanel() {
  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [dueDate, setDueDate] = useState(new Date());
  const [priority, setPriority] = useState("");
  const [taskName, setTaskName] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [selectedSubtask, setSelectedSubtask] = useState(null);
  const [editedSubtaskText, setEditedSubtaskText] = useState("");
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [showAGiXTModal, setShowAGiXTModal] = useState(false);
  const [selectedChain, setSelectedChain] = useState(null);
  const [showChainDropdown, setShowChainDropdown] = useState(false);
  const [showDependenciesModal, setShowDependenciesModal] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [alwaysUseAgent, setAlwaysUseAgent] = useState(false);
  const [chains, setChains] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agixtApiUri, setAgixtApiUri] = useState("");
  const [agixtApiKey, setAgixtApiKey] = useState("");
  const [dependencies, setDependencies] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  useEffect(() => {
    const getGithubUsernameAndAuthKey = async () => {
      try {
        const storedGithubUsername = await AsyncStorage.getItem('githubUsername');
        const storedAuthKey = await AsyncStorage.getItem('authKey');

        if (storedGithubUsername && storedAuthKey) {
          setGithubUsername(storedGithubUsername);
          setAuthKey(storedAuthKey);
          loadTasks();
          getChains();
        } else {
          console.log('GitHub username and/or API key not available');
        }
      } catch (error) {
        console.log('Error getting GitHub username and/or API key from AsyncStorage:', error);
      }
    };

    const getAgixtApiUriAndKey = async () => {
      try {
        const storedAgixtApiUri = await AsyncStorage.getItem(AGIXT_API_URI_KEY);
        const storedAgixtApiKey = await AsyncStorage.getItem(AGIXT_API_KEY_KEY);

        if (storedAgixtApiUri && storedAgixtApiKey) {
          setAgixtApiUri(storedAgixtApiUri);
          setAgixtApiKey(storedAgixtApiKey);
        } else {
          console.log('AGiXT API URI and/or API key not available');
        }
      } catch (error) {
        console.log('Error getting AGiXT API URI and/or API key from AsyncStorage:', error);
      }
    };

    getGithubUsernameAndAuthKey();
    getAgixtApiUriAndKey();
    loadTasks();
    getChains(); 
  }, []);

  const { loading, error, data } = useQuery(GET_USER_REPOSITORIES, {
    variables: { username: githubUsername },
  });

  const loadTasks = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem("tasks");
      if (storedTasks !== null) {
        setTasks(JSON.parse(storedTasks));
      }
    } catch (error) {
      console.log("Error loading tasks:", error);
    }
  };

  const saveTasks = async (updatedTasks: any[]) => {
    try {
      await AsyncStorage.setItem("tasks", JSON.stringify(updatedTasks));
      setTasks(updatedTasks);
    } catch (error) {
      console.log("Error saving tasks:", error);
    }
  };

  const getChains = async (refreshOnError = false) => {
    try {
      setIsLoading(true);
      const ApiClient = new AGiXTSDK({
        baseUri: agixtApiUri,
        apiKey: agixtApiKey,
      });
      const chainsObject = await ApiClient.getChains();
      
      // Check if chainsObject is an object or an array
      let chainsArray;
      if (Array.isArray(chainsObject)) {
        chainsArray = chainsObject;
      } else if (typeof chainsObject === 'object') {
        chainsArray = Object.keys(chainsObject);
      } else {
        throw new Error('Unexpected response format for chains');
      }
      
      setChains(chainsArray);
    } catch (error) {
      console.error("Error getting chains:", error);
      if (refreshOnError) {
        setTimeout(() => getChains(true), 10000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getChains(true);
    return () => clearTimeout();
  }, []);

  const addTask = () => {
    if (taskText.trim().length > 0) {
      const newTask = {
        id: Date.now(),
        text: taskText.trim(),
        note: "",
        dueDate: null,
        priority: priority,
        repo: selectedRepo,
        subtasks: [],
      };
      setTasks([...tasks, newTask]);
      saveTasks([...tasks, newTask]);
      setTaskText("");
      setPriority("");
      setSelectedRepo("");
      setSubtaskText("");
    }
  };

  const taskdetails = {
    taskName: taskName,
    note: noteText ? true : false,
    dependencies: dependencies,
    dueDate: dueDate,
    description: taskDescription,
  };

  const addSubtask = (taskId, subtaskText) => {
    const updatedTasks = tasks.map((task) => {
      if (task.id === taskId) {
        const newSubtask = { id: Date.now(), text: subtaskText };
        return {
          ...task,
          subtasks: task.subtasks ? [...task.subtasks, newSubtask] : [newSubtask],
        };
      }
      return task;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setSubtaskText("");
  };

  const removeSubtask = (tasks, subtaskId) => {
    return tasks.map((task) => {
      if (task.subtasks && task.subtasks.length > 0) {
        const updatedSubtasks = task.subtasks.filter((subtask) => subtask.id !== subtaskId);
        return {
          ...task,
          subtasks: updatedSubtasks,
        };
      }
      return task;
    });
  };

  const editSubtask = (taskId, subtaskId, subtaskText) => {
    const updatedTasks = tasks.map((task) => {
      if (task.id === taskId) {
        const updatedSubtasks = task.subtasks.map((subtask) => {
          if (subtask.id === subtaskId) {
            return { ...subtask, text: subtaskText };
          }
          return subtask;
        });
        return { ...task, subtasks: updatedSubtasks };
      }
      return task;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setSelectedSubtask(updatedTasks.find((task) => task.id === taskId).subtasks.find((subtask) => subtask.id === subtaskId));
    setEditedSubtaskText(subtaskText);
  };

  const handleSubtaskSelect = (subtask) => {
    setSelectedSubtask(subtask);
  };

  const handleSubtaskRemove = (subtaskId) => {
    const updatedTasks = removeSubtask(tasks, subtaskId);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  };

  const SubtaskTree = ({ task, selectedSubtask, onSubtaskSelect, onSubtaskRemove, onSubtaskAdd }) => {
    const [newSubtaskText, setNewSubtaskText] = useState("");
  
    const handleSubtaskRemove = (subtaskId) => {
      onSubtaskRemove(subtaskId);
    };

    const handleSubtaskAdd = () => {
      if (newSubtaskText.trim().length > 0) {
        onSubtaskAdd(task.id, newSubtaskText);
        setNewSubtaskText("");
      }
    };
    
    return (
      <View style={styles.subtaskTreeContainer}>
        {task.subtasks && task.subtasks.length > 0 && (
          <View style={styles.subtaskTreeChildren}>
            {task.subtasks.map((subtask) => (
              <View key={subtask.id} style={styles.subtaskTreeItem}>
                <TouchableOpacity
                  style={[
                    styles.subtaskText,
                    selectedSubtask?.id === subtask.id ? styles.selectedSubtask : null,
                  ]}
                  onPress={() => onSubtaskSelect(subtask)}
                >
                  <Text style={{ color: '#FFFFFF' }}>{subtask.text}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeSubtaskButton}
                  onPress={() => handleSubtaskRemove(subtask.id)}
                >
                  <Icon name="delete" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <TextInput
          style={[styles.input, { color: '#FFFFFF' }]}
          value={newSubtaskText}
          onChangeText={setNewSubtaskText}
          placeholder="Add a new subtask"
          placeholderTextColor="#FFFFFF80"
          onSubmitEditing={handleSubtaskAdd}
        />
      </View>
    );
  };
  
  const handleTaskNameChange = (text: string) => {
    setTaskName(text);
  };
  
  const ExampleCustomInput = React.forwardRef<HTMLDivElement, { value: string | null; onClick: () => void }>((props, ref) => (
    <TouchableOpacity style={styles.input} onPress={props.onClick} ref={ref}>
      <Text style={{ color: "white" }}>
        {props.value ? props.value : "No Due Date Set"}
      </Text>
    </TouchableOpacity>
  ));
  
  const removeTask = (id: number) => {
    const updatedTasks = tasks.filter((task) => task.id !== id);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  };
  
  const editTask = (task: any) => {
    setSelectedTask(task);
    setNoteText(task.note || "");
    setDueDate(task.dueDate ? new Date(task.dueDate) : null);
    setPriority(task.priority || "");
    setShowEditModal(true);
    setTaskName(task.text);
    setSelectedRepo(task.repo);
  };
  
  const removeDueDate = () => {
    setDueDate(null);
  };
  
  const handleTaskDescriptionChange = (text: string) => {
    setTaskDescription(text);
  };

  const saveTaskEdit = () => {
    const updatedTasks = tasks.map((task) => {
      if (task.id === selectedTask?.id) {
        return {
          ...task,
          text: taskName,
          note: noteText,
          description: taskDescription,
          dueDate: dueDate ? dueDate.toISOString() : null,
          priority: priority,
          repo: selectedRepo,
          subtasks: task.subtasks.map((subtask) => {
            if (subtask.id === selectedSubtask?.id) {
              return { ...subtask, text: editedSubtaskText };
            }
            return subtask;
          }),
        };
      }
      return task;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setShowEditModal(false);
    setSelectedTask(null);
    setSelectedSubtask(null);
    setEditedSubtaskText("");
  };
  
  const handleAgentSelect = (agent, always) => {
    setSelectedAgent(agent);
    setAlwaysUseAgent(always);
    setShowAGiXTModal(false);
    if (selectedChain) {
      executeChain(agent, selectedChain);
    }
  };

  const handleChainSelect = (chain) => {
    setSelectedChain(chain);
    if (alwaysUseAgent && selectedAgent) {
      executeChain(selectedAgent, chain);
    } else {
      setShowAGiXTModal(true);
    }
  };

  const executeChain = async (agent, chain) => {
    try {
      setIsLoading(true);
      const agixt = new AGiXTSDK({
        baseUri: agixtApiUri,
        apiKey: agixtApiKey,
      });
      const result = await agixt.runChain(chain, "", agent);
      console.log("Chain execution result:", result);
      // Handle the result as needed (e.g., update task, show notification)
    } catch (error) {
      console.error("Error executing chain:", error);
      // Handle the error (e.g., show error message)
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDependencySelect = (taskId) => {
    if (dependencies.includes(taskId)) {
      setDependencies(dependencies.filter((id) => id !== taskId));
    } else {
      setDependencies([...dependencies, taskId]);
    }
  };
  
  const toggleGuidance = () => {
    setShowGuidance(!showGuidance);
  };
  
  const handleGetSubtasks = async (taskDescription, taskName, taskDetails) => {
    const subtasks = await getSubtasks(taskDescription, taskName, taskDetails, agixtApiUri, agixtApiKey);
    // Update the task's subtasks here
    console.log(subtasks);
  };
  
  return (
    <View style={styles.container}>
      <View style={[styles.agixtComponentContainer, { position: 'absolute', zIndex: 1 }]}>
        <Modal
          visible={showAGiXTModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAGiXTModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Agent</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowAGiXTModal(false)}
                >
                  <Icon name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <AGiXTComponent 
                agixtApiUri={agixtApiUri} 
                agixtApiKey={agixtApiKey} 
                onSelect={handleAgentSelect}
              />
            </View>
          </View>
        </Modal>
      </View>
      <View style={styles.aiGuidanceContainer}>
        <TouchableOpacity style={styles.toggleGuidanceButton} onPress={toggleGuidance}>
          <Icon name={showGuidance ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#FFFFFF" />
        </TouchableOpacity>
        {showGuidance && (
          <View style={styles.guidanceContainer}>
            <Text style={styles.guidanceText}>
              AI Task Guidance
            </Text>
          </View>
        )}
      </View>
      {!githubUsername || !data ? (
        <View style={styles.repoPickerContainer}>
          <Text style={styles.repoPickerLabel}>GitHub username and API key not available. Please set them by accessing Home and top right settings icon to be able to use the integration.</Text>
        </View>
      ) : (
        <View style={styles.repoPickerContainer}>
          <Text style={styles.repoPickerLabel}>Select a Repository:</Text>
          <Picker
            style={styles.repoPicker}
            selectedValue={selectedRepo}
            onValueChange={(value) => setSelectedRepo(value)}
          >
            <Picker.Item label="Select a repository" value={null} />
            {data.user.repositories.nodes.map((repo: any) => (
              <Picker.Item key={repo.name} label={repo.name} value={repo.name} />
            ))}
          </Picker>
        </View>
      )}
  
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={taskText}
          onChangeText={setTaskText}
          placeholder="Enter a task"
          placeholderTextColor="#FFFFFF80"
        />
        <TextInput
          style={styles.input}
          value={priority}
          onChangeText={setPriority}
          placeholder="Priority (e.g., High, Medium, Low)"
          placeholderTextColor="#FFFFFF80"
        />
        <TouchableOpacity style={styles.addButton} onPress={addTask}>
          <Icon name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.taskContainer,
              {
                borderColor:
                  item.dueDate && new Date(item.dueDate) < new Date()
                    ? "#FF3B30"
                    : "transparent",
                backgroundColor:
                  selectedTask && selectedTask.id === item.id
                    ? "#2E2E2E"
                    : "#1E1E1E",
              },
            ]}
            onPress={() => editTask(item)}
          >
            <View style={styles.taskInfoContainer}>
              <Text
                style={[
                  styles.taskText,
                  {
                    fontWeight:
                      item.dueDate && new Date(item.dueDate) < new Date()
                        ? "bold"
                        : "normal",
                  },
                ]}
              >
                {item.text}
              </Text>
              {item.note && <Text style={styles.noteText}>Note: {item.note}</Text>}
              {item.dueDate && (
                <Text style={styles.dueDateText}>
                  Due Date: {new Date(item.dueDate).toLocaleString()}
                </Text>
              )}
              {item.priority && (
                <Text style={styles.priorityText}>Priority: {item.priority}</Text>
              )}
              {item.repo && (
                <Text style={styles.repoText}>Repository: {item.repo}</Text>
              )}
              <SubtaskTree
                task={item}
                selectedSubtask={selectedSubtask}
                onSubtaskSelect={handleSubtaskSelect}
                onSubtaskRemove={handleSubtaskRemove}
                onSubtaskAdd={addSubtask}
              />
            </View>
            <View style={styles.taskButtonsContainer}>
  {isLoading ? (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color="#FFFFFF" />
      <Text style={styles.loadingText}>Loading chains...</Text>
    </View>
  ) : (
    <>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => {
          setShowChainDropdown(!showChainDropdown);
        }}
      >
        <Icon name="play-arrow" size={24} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>
          {selectedChain ? selectedChain : 'Run Chain'}
        </Text>
        {showChainDropdown && (
  <View style={styles.chainDropdownContainer}>
    {chains.map((chain) => (
      <TouchableOpacity
        key={chain}
        style={styles.chainDropdownItem}
        onPress={() => handleChainSelect(chain)}
      >
        <Text style={styles.chainDropdownText}>{chain}</Text>
      </TouchableOpacity>
    ))}
  </View>
)}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => handleGetSubtasks(taskDescription, taskName, taskdetails)}
      >
        <Icon name="list" size={24} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>Get Subtasks</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeTask(item.id)}
      >
        <Icon name="delete" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </>
  )}
</View>
          </TouchableOpacity>
        )}
      />
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowEditModal(false)}
              >
                <Icon name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={{ color: "white" }}>Task Name:</Text>
              <TextInput
                style={styles.input}
                value={taskName}
                onChangeText={handleTaskNameChange}
                placeholder="Enter a task"
                placeholderTextColor="#FFFFFF80"
              />
              <Text style={{ color: "white" }}>Task Description:</Text>
              <TextInput
                style={styles.input}
                value={taskDescription}
                onChangeText={handleTaskDescriptionChange}
                placeholder="Enter a task description"
                placeholderTextColor="#FFFFFF80"
              />
              <View>
                <Text style={{ color: "white" }}>Subtasks:</Text>
                <FlatList
                  data={selectedTask?.subtasks || []}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <View style={styles.subtaskContainer}>
                      <TextInput
                        style={[
                          styles.subtaskText,
                          { color: '#FFFFFF' },
                          item.id === selectedSubtask?.id
                            ? styles.selectedSubtask
                            : null,
                        ]}
                        value={
                          item.id === selectedSubtask?.id
                            ? editedSubtaskText
                            : item.text
                        }
                        onChangeText={
                          item.id === selectedSubtask?.id
                            ? setEditedSubtaskText
                            : (text) => {
                                setNewSubtaskText(text);
                                setSelectedSubtask(item);
                              }
                        }
                        placeholder={item.text}
                        placeholderTextColor="#FFFFFF80"
                        onSubmitEditing={() =>
                          item.id === selectedSubtask?.id
                            ? editSubtask(
                                selectedTask.id,
                                selectedSubtask.id,
                                editedSubtaskText
                              )
                            : addSubtask(selectedTask.id, newSubtaskText)
                        }
                      />
                      {item.id === selectedSubtask?.id && (
                        <TouchableOpacity
                          style={styles.saveSubtaskButton}
                          onPress={() =>
                            editSubtask(
                              selectedTask.id,
                              selectedSubtask.id,
                              editedSubtaskText
                            )
                          }
                        >
                          <Icon name="check" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                />
                <TextInput
                  style={styles.input}
                  value={newSubtaskText}
                  onChangeText={setNewSubtaskText}
                  placeholder="Add a new subtask"
                  placeholderTextColor="#FFFFFF80"
                  onSubmitEditing={() =>
                    addSubtask(selectedTask.id, newSubtaskText)
                  }
                />
              </View>
              <View>
                <Text style={{ color: "white" }}>Note:</Text>
                <TextInput
                  style={styles.input}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Enter a note"
                  placeholderTextColor="#FFFFFF80"
                />
                <Text style={{ color: "white" }}>Due Date:</Text>
                <DatePicker
                  selected={dueDate}
                  onChange={(date: Date) => setDueDate(date)}
                  showTimeSelect
                  dateFormat="MMMM d, yyyy h:mm aa"
                  placeholderText="No Due Date Set"
                  customInput={<ExampleCustomInput />}
                />
                <TouchableOpacity
                  style={styles.removeDueDateButton}
                  onPress={removeDueDate}
                >
                  <Text style={styles.buttonText}>Remove Due Date</Text>
                </TouchableOpacity>
                <Text style={{ color: "white" }}>Priority:</Text>
                <TextInput
                  style={styles.input}
                  value={priority}
                  onChangeText={setPriority}
                  placeholder="Priority (e.g., High, Medium, Low)"
                  placeholderTextColor="#FFFFFF80"
                />
                <Text style={{ color: "white" }}>Repository:</Text>
                <Picker
                  style={styles.repoPicker}
                  selectedValue={selectedRepo}
                  onValueChange={(value) => setSelectedRepo(value)}
                >
                  <Picker.Item label="Select a repository" value={null} />
                  {data &&
                    data.user &&
                    data.user.repositories.nodes.map((repo: any) => (
                      <Picker.Item
                        key={repo.name}
                        label={repo.name}
                        value={repo.name}
                      />
                    ))}
                </Picker>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={saveTaskEdit}
                >
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#121212",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    padding: 16,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#FFFFFF80",
    borderRadius: 8,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    marginRight: 16,
    backgroundColor: "#1E1E1E",
  },
  addButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
  },
  taskContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#1E1E1E",
    padding: 8,
    borderRadius: 8,
    borderWidth: 2,
  },
  taskInfoContainer: {
    flex: 1,
    color: "#FFFFFF",
  },
  taskText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  noteText: {
    marginTop: 8,
    fontSize: 16,
    fontStyle: "italic",
    color: "#FFFFFF80",
    padding: 2,
  },
  dueDateText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF80",
  },
  priorityText: {
    marginTop: 8,
    fontSize: 16,
    color: "#FFFFFF80",
  },
  repoText: {
    marginTop: 8,
    fontSize: 16,
    color: "#FFFFFF80",
  },
  removeButton: {
    backgroundColor: "#FF3B30",
    padding: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    padding: 75,
    borderRadius: 16,
    width: "90%",
    maxHeight: "80%",
    marginBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    padding: 12,
  },
  modalBody: {
    maxHeight: "80%",
    paddingBottom: 24,
  },
  closeButton: {
    backgroundColor: "#FF3B30",
    padding: 12,
    borderRadius: 8,
  },
  modalButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: "25%",
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: 24,
  },
  removeDueDateButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: "25%",
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: 24,
  },
  repoPickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    color: "#FFFFFF",
  },
  repoPickerLabel: {
    color: "#FFFFFF",
    marginRight: 16,
  },
  repoPicker: {
    flex: 1,
    color: "black",
  },
  subtaskTreeContainer: {
    marginTop: 16,
    color: "#FFFFFF",
  },
  subtaskTreeItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  subtaskTreeChildren: {
    marginLeft: 24,
  },
  subtaskText: {
    flex: 1,
    fontSize: 16,
    color: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#2E2E2E",
  },
  selectedSubtask: {
    backgroundColor: "#3E3E3E",
  },
  saveSubtaskButton: {
    backgroundColor: "#007AFF",
    padding: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  subtaskContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  agixtComponentContainer: {
    width: "100%",
    height: "auto",
    backgroundColor: "transparent",
  },
  agentsContainer: {
    marginTop: 24,
  },
  agentsLabel: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  agentPicker: {
    color: "black",
    marginBottom: 16,
  },
  agentsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    color: "black",
  },
  agentItem: {
    backgroundColor: "#2E2E2E",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedAgentItem: {
    backgroundColor: "#4E4E4E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  selectedAgentText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  agentText: {
    color: "black",
  },
  alwaysUseAgentContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  alwaysUseAgentLabel: {
    fontSize: 16,
    color: "#FFFFFF",
    marginRight: 8,
  },
  alwaysUseAgentCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  alwaysUseAgentChecked: {
    backgroundColor: "#FFFFFF",
  },
  alwaysUseAgentCheckboxText: {
    color: "#1E1E1E",
    fontWeight: "bold",
  },
  okButton: {
    backgroundColor: "#4E4E4E",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 24,
  },
  okButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  toggleButton: {
    backgroundColor: "#2E2E2E",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  toggleButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  taskButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#007AFF",
    minWidth: 120, // Ensure a minimum width for consistency
  },
  actionButtonText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontWeight: "bold",
  },
  removeButton: {
    backgroundColor: "#FF3B30",
    padding: 12,
    borderRadius: 8,
  },
  chainDropdownContainer: {
    position: "absolute",
    top: 48,
    left: 0,
    backgroundColor: "#2E2E2E",
    borderRadius: 8,
    padding: 8,
    zIndex: 1,
    maxHeight: 200,
    overflow: "scroll",
  },
  chainDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chainDropdownText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  aiGuidanceContainer: {
    position: "absolute",
    bottom: 24,
    right: 24,
    zIndex: 1,
  },
  toggleGuidanceButton: {
    backgroundColor: "#2E2E2E",
    padding: 12,
    borderRadius: 8,
  },
  guidanceContainer: {
    backgroundColor: "#2E2E2E",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  guidanceText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    marginLeft: 16,
    fontSize: 18,
  },
  getSubtasksButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  getSubtasksButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});