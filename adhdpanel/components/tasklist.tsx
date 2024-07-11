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
      const subtaskTitle = section.split(': ')[1].trim();
      let subtaskDescription = '';
      let j = i + 1;
      while (j < sections.length && !sections[j].startsWith(`**Task ${j + 1}:`)) {
        subtaskDescription += sections[j].trim() + '\n';
        j++;
      }
      subtasks.push({
        id: Date.now() + i,
        text: subtaskTitle,
        description: subtaskDescription.trim(),
      });
      i = j - 1;
    }
  }

  return subtasks;
}

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
  const [tasks, setTasks] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [githubUsername, setGithubUsername] = useState("");
  const [showAGiXTModal, setShowAGiXTModal] = useState(false);
  const [selectedChain, setSelectedChain] = useState(null);
  const [chains, setChains] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agixtApiUri, setAgixtApiUri] = useState("");
  const [agixtApiKey, setAgixtApiKey] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("");
  const [showAGiXTOptionsModal, setShowAGiXTOptionsModal] = useState(false);
  const [selectedTaskForAGiXT, setSelectedTaskForAGiXT] = useState(null);
  const [chainInput, setChainInput] = useState("");

  useEffect(() => {
    const loadInitialData = async () => {
      await loadGithubData();
      await loadAgixtData();
      await loadTasks();
      await getChains();
    };

    loadInitialData();
  }, []);

  const loadGithubData = async () => {
    try {
      const storedGithubUsername = await AsyncStorage.getItem('githubUsername');
      if (storedGithubUsername) {
        setGithubUsername(storedGithubUsername);
      }
    } catch (error) {
      console.log('Error getting GitHub username from AsyncStorage:', error);
    }
  };

  const loadAgixtData = async () => {
    try {
      const storedAgixtApiUri = await AsyncStorage.getItem(AGIXT_API_URI_KEY);
      const storedAgixtApiKey = await AsyncStorage.getItem(AGIXT_API_KEY_KEY);
      if (storedAgixtApiUri && storedAgixtApiKey) {
        setAgixtApiUri(storedAgixtApiUri);
        setAgixtApiKey(storedAgixtApiKey);
      }
    } catch (error) {
      console.log('Error getting AGiXT data from AsyncStorage:', error);
    }
  };

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

  const saveTasks = async (updatedTasks) => {
    try {
      await AsyncStorage.setItem("tasks", JSON.stringify(updatedTasks));
      setTasks(updatedTasks);
    } catch (error) {
      console.log("Error saving tasks:", error);
    }
  };

  const getChains = async () => {
    try {
      setIsLoading(true);
      const ApiClient = new AGiXTSDK({
        baseUri: agixtApiUri,
        apiKey: agixtApiKey,
      });
      const chainsObject = await ApiClient.getChains();
      
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
    } finally {
      setIsLoading(false);
    }
  };

  const addTask = () => {
    if (newTaskText.trim().length > 0) {
      const newTask = {
        id: Date.now(),
        text: newTaskText.trim(),
        note: "",
        dueDate: null,
        priority: newTaskPriority,
        repo: "",
        subtasks: [],
      };
      const updatedTasks = [...tasks, newTask];
      saveTasks(updatedTasks);
      setNewTaskText("");
      setNewTaskPriority("");
    }
  };

  const removeTask = (id) => {
    const updatedTasks = tasks.filter((task) => task.id !== id);
    saveTasks(updatedTasks);
  };

  const editTask = (task) => {
    setSelectedTask(task);
    setShowEditModal(true);
  };

  const handleSaveTask = (editedTask) => {
    const updatedTasks = tasks.map((task) =>
      task.id === editedTask.id ? editedTask : task
    );
    saveTasks(updatedTasks);
    setShowEditModal(false);
    setSelectedTask(null);
  };

  const handleAgentSelect = async (agent, chain, input) => {
    setShowAGiXTModal(false);
    if (chain) {
      await executeChain(agent, chain, input);
    }
  };

  const executeChain = async (agent, chain, input) => {
    try {
      setIsLoading(true);
      const agixt = new AGiXTSDK({
        baseUri: agixtApiUri,
        apiKey: agixtApiKey,
      });
      const result = await agixt.runChain(chain, input, agent);
      console.log("Chain execution result:", result);
      // Handle the result as needed (e.g., update task, show notification)
    } catch (error) {
      console.error("Error executing chain:", error);
      // Handle the error (e.g., show error message)
    } finally {
      setIsLoading(false);
    }
  };

  const handleAGiXTOptionSelect = async (option) => {
    if (option === 'getSubtasks') {
      const subtasks = await getSubtasks(
        selectedTaskForAGiXT.text,
        selectedTaskForAGiXT.text,
        {
          note: selectedTaskForAGiXT.note,
          dueDate: selectedTaskForAGiXT.dueDate,
          priority: selectedTaskForAGiXT.priority,
        },
        agixtApiUri,
        agixtApiKey
      );
      const updatedTasks = tasks.map(task => 
        task.id === selectedTaskForAGiXT.id 
          ? { ...task, subtasks: [...(task.subtasks || []), ...subtasks] }
          : task
      );
      saveTasks(updatedTasks);
    } else if (option === 'runChain') {
      setShowAGiXTModal(true);
    }
    setShowAGiXTOptionsModal(false);
  };

  const { loading, error, data } = useQuery(GET_USER_REPOSITORIES, {
    variables: { username: githubUsername },
  });

  const repositories = data?.user?.repositories?.nodes || [];

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newTaskText}
          onChangeText={setNewTaskText}
          placeholder="Enter a task"
          placeholderTextColor="#FFFFFF80"
        />
        <TextInput
          style={styles.input}
          value={newTaskPriority}
          onChangeText={setNewTaskPriority}
          placeholder="Priority"
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
          <TaskItem
            task={item}
            onEdit={() => editTask(item)}
            onRemove={() => removeTask(item.id)}
            onAGiXTOptions={(task) => {
              setSelectedTaskForAGiXT(task);
              setShowAGiXTOptionsModal(true);
            }}
            chains={chains}
            isLoading={isLoading}
          />
        )}
      />

      <EditTaskModal
        visible={showEditModal}
        task={selectedTask}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveTask}
        repositories={repositories}
      />

      <AGiXTModal
        visible={showAGiXTModal}
        onClose={() => setShowAGiXTModal(false)}
        onAgentSelect={handleAgentSelect}
        agixtApiUri={agixtApiUri}
        agixtApiKey={agixtApiKey}
        chains={chains}
      />

      <AGiXTOptionsModal
        visible={showAGiXTOptionsModal}
        onClose={() => setShowAGiXTOptionsModal(false)}
        onOptionSelect={handleAGiXTOptionSelect}
      />
    </View>
  );
}

const TaskItem = ({ task, onEdit, onRemove, onAGiXTOptions, chains, isLoading }) => {
  return (
    <View style={styles.taskContainer}>
      <View style={styles.taskInfoContainer}>
        <Text style={styles.taskText}>{task.text}</Text>
        {task.note && <Text style={styles.noteText}>Note: {task.note}</Text>}
        {task.dueDate && (
          <Text style={styles.dueDateText}>
            Due: {new Date(task.dueDate).toLocaleDateString()}
          </Text>
        )}
        {task.priority && (
          <Text style={styles.priorityText}>Priority: {task.priority}</Text>
        )}
        {task.repo && (
          <Text style={styles.repoText}>Repo: {task.repo}</Text>
        )}
        {task.subtasks && task.subtasks.length > 0 && (
          <View style={styles.subtasksContainer}>
            <Text style={styles.subtasksTitle}>Subtasks:</Text>
            {task.subtasks.map((subtask, index) => (
              <Text key={subtask.id} style={styles.subtaskText}>
                {index + 1}. {subtask.text}
              </Text>
            ))}
          </View>
        )}
      </View>
      <View style={styles.taskButtonsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Icon name="edit" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => onAGiXTOptions(task)}
        >
          <Icon name="play-arrow" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
          <Icon name="delete" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const EditTaskModal = ({ visible, task, onClose, onSave, repositories }) => {
  const [editedTask, setEditedTask] = useState(null);

  useEffect(() => {
    if (task) {
      setEditedTask({
        id: task.id,
        text: task.text || '',
        note: task.note || '',
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        priority: task.priority || '',
        repo: task.repo || '',
        subtasks: task.subtasks || [],
      });
    } else {
      setEditedTask(null);
    }
  }, [task]);

  const handleChange = (field, value) => {
    if (editedTask) {
      setEditedTask({ ...editedTask, [field]: value });
    }
  };

  const handleSave = () => {
    if (editedTask) {
      onSave(editedTask);
    }
  };

  if (!editedTask) {
    return null;
  }

  return (
    <Modal
  visible={visible}
  animationType="slide"
  transparent={true}
  onRequestClose={onClose}
>
  <View style={styles.modalOverlay}>
    <View style={[styles.modalContent, { zIndex: 1000 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Task</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            <InputField
              label="Task Name"
              value={editedTask.text}
              onChangeText={(text) => handleChange('text', text)}
            />
            
            <InputField
              label="Description"
              value={editedTask.note}
              onChangeText={(text) => handleChange('note', text)}
              multiline
            />
            
            <View style={styles.datePickerContainer}>
  <Text style={styles.inputLabel}>Due Date</Text>
  <DatePicker
    selected={editedTask.dueDate}
    onChange={(date) => handleChange('dueDate', date)}
    customInput={<CustomDatePickerInput />}
    popperPlacement="top-start"
    popperModifiers={[
      {
        name: 'offset',
        options: {
          offset: [0, 10],
        },
      },
      {
        name: 'preventOverflow',
        options: {
          boundary: 'viewport',
        },
      },
    ]}
  />
</View>
            
            <PickerField
              label="Priority"
              value={editedTask.priority}
              onValueChange={(value) => handleChange('priority', value)}
              items={[
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
              ]}
            />
            
            <PickerField
              label="Repository"
              value={editedTask.repo}
              onValueChange={(value) => handleChange('repo', value)}
              items={repositories.map(repo => ({ label: repo.name, value: repo.name }))}
            />
            
            <SubtasksList
              subtasks={editedTask.subtasks}
              onSubtasksChange={(subtasks) => handleChange('subtasks', subtasks)}
            />
          </ScrollView>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const CustomDatePickerInput = React.forwardRef(({ value, onClick }, ref) => (
  <TouchableOpacity onPress={onClick} ref={ref} style={styles.datePickerButton}>
    <Text style={styles.datePickerButtonText}>
      {value ? value : "Select date"}
    </Text>
  </TouchableOpacity>
));

const InputField = ({ label, value, onChangeText, multiline = false }) => (
  <View style={styles.inputField}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.multilineInput]}
      value={value || ''}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholderTextColor="#FFFFFF80"
    />
  </View>
);

const PickerField = ({ label, value, onValueChange, items }) => (
  <View style={styles.inputField}>
    <Text style={styles.inputLabel}>{label}</Text>
    <Picker
      selectedValue={value || ''}
      onValueChange={onValueChange}
      style={styles.picker}
    >
      {items.map((item) => (
        <Picker.Item key={item.value} label={item.label} value={item.value} />
      ))}
    </Picker>
  </View>
);

const SubtasksList = ({ subtasks, onSubtasksChange }) => {
  const addSubtask = () => {
    onSubtasksChange([...subtasks, { id: Date.now(), text: '' }]);
  };

  const updateSubtask = (id, text) => {
    onSubtasksChange(subtasks.map(st => st.id === id ? { ...st, text } : st));
  };

  const removeSubtask = (id) => {
    onSubtasksChange(subtasks.filter(st => st.id !== id));
  };

  return (
    <View style={styles.subtasksList}>
      <Text style={styles.inputLabel}>Subtasks</Text>
      {subtasks.map((subtask) => (
        <View key={subtask.id} style={styles.subtaskItem}>
          <TextInput
            style={styles.subtaskInput}
            value={subtask.text}
            onChangeText={(text) => updateSubtask(subtask.id, text)}
            placeholderTextColor="#FFFFFF80"
          />
          <TouchableOpacity onPress={() => removeSubtask(subtask.id)}>
            <Icon name="remove-circle-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addSubtaskButton} onPress={addSubtask}>
        <Icon name="add-circle-outline" size={24} color="#007AFF" />
        <Text style={styles.addSubtaskText}>Add Subtask</Text>
      </TouchableOpacity>
    </View>
  );
};

const AGiXTModal = ({ visible, onClose, onAgentSelect, agixtApiUri, agixtApiKey, chains }) => {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedChain, setSelectedChain] = useState("");
  const [chainInput, setChainInput] = useState("");
  const [alwaysUseAgent, setAlwaysUseAgent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableChains, setAvailableChains] = useState([]);

  useEffect(() => {
    const fetchAgentsAndChains = async () => {
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

        const chainsData = await agixt.getChains();
        setAvailableChains(chainsData);
        setSelectedChain(chainsData.length > 0 ? chainsData[0] : "");

        const storedAlwaysUseAgent = await AsyncStorage.getItem(ALWAYS_USE_AGENT_KEY);
        if (storedAlwaysUseAgent !== null) {
          setAlwaysUseAgent(JSON.parse(storedAlwaysUseAgent));
        }

        setError(null);
      } catch (error) {
        console.error("Error fetching agents and chains:", error);
        setError("Failed to fetch agents and chains. Please check your API settings.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgentsAndChains();
  }, [agixtApiUri, agixtApiKey]);

  const handleAlwaysUseAgentChange = async () => {
    const newValue = !alwaysUseAgent;
    setAlwaysUseAgent(newValue);
    await AsyncStorage.setItem(ALWAYS_USE_AGENT_KEY, JSON.stringify(newValue));
  };

  const handleOk = () => {
    onAgentSelect(selectedAgent, selectedChain, chainInput);
    onClose();
  };

  if (isLoading) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.modalText}>Loading agents and chains...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (error) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Select an Agent and Chain</Text>
          <Picker
            selectedValue={selectedAgent}
            onValueChange={setSelectedAgent}
            style={styles.agentPicker}
          >
            {agents.map((agent) => (
              <Picker.Item key={agent.name} label={agent.name} value={agent.name} />
            ))}
          </Picker>
          <Picker
            selectedValue={selectedChain}
            onValueChange={setSelectedChain}
            style={styles.chainPicker}
          >
            {availableChains.map((chain) => (
              <Picker.Item key={chain} label={chain} value={chain} />
            ))}
          </Picker>
          <TextInput
            style={styles.chainInput}
            value={chainInput}
            onChangeText={setChainInput}
            placeholder="Enter chain input"
            placeholderTextColor="#FFFFFF80"
          />
          <View style={styles.checkboxContainer}>
            <TouchableOpacity style={styles.checkbox} onPress={handleAlwaysUseAgentChange}>
              {alwaysUseAgent && <Icon name="check" size={24} color="#007AFF" />}
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>Always use this agent</Text>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.buttonCancel]} onPress={onClose}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonOk]} onPress={handleOk}>
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const AGiXTOptionsModal = ({ visible, onClose, onOptionSelect }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>AGiXT Options</Text>
          <TouchableOpacity
            style={styles.modalOption}
            onPress={() => onOptionSelect('getSubtasks')}
          >
            <Text style={styles.modalOptionText}>Get Subtasks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalOption}
            onPress={() => onOptionSelect('runChain')}
          >
            <Text style={styles.modalOptionText}>Run Chain</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#121212',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskContainer: {
    backgroundColor: '#2C2C2C',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskInfoContainer: {
    flex: 1,
  },
  taskText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noteText: {
    color: '#BBBBBB',
    fontSize: 14,
    marginTop: 5,
  },
  dueDateText: {
    color: '#BBBBBB',
    fontSize: 14,
    marginTop: 5,
  },
  priorityText: {
    color: '#BBBBBB',
    fontSize: 14,
    marginTop: 5,
  },
  repoText: {
    color: '#BBBBBB',
    fontSize: 14,
    marginTop: 5,
  },
  subtasksContainer: {
    marginTop: 10,
  },
  subtasksTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtaskText: {
    color: '#BBBBBB',
    fontSize: 14,
    marginLeft: 10,
  },
  taskButtonsContainer: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 5,
    marginLeft: 10,
  },
  removeButton: {
    padding: 5,
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    zIndex: 1000,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalBody: {
    maxHeight: '70%',
  },
  inputField: {
    marginBottom: 15,
  },
  inputLabel: {
    color: '#FFFFFF',
    marginBottom: 5,
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  datePickerContainer: {
    marginBottom: 15,
    zIndex: 9999,
  },
  datePickerButton: {
    backgroundColor: '#2C2C2C',
    padding: 10,
    borderRadius: 5,
  },
  datePickerButtonText: {
    color: '#FFFFFF',
  },
  picker: {
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
  },
  subtasksList: {
    marginTop: 15,
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  subtaskInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  addSubtaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addSubtaskText: {
    color: '#007AFF',
    marginLeft: 5,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  button: {
    padding: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  agentPicker: {
    width: '100%',
    color: '#FFFFFF',
    backgroundColor: '#2C2C2C',
    marginBottom: 10,
  },
  chainPicker: {
    width: '100%',
    color: '#FFFFFF',
    backgroundColor: '#2C2C2C',
    marginBottom: 10,
  },
  chainInput: {
    width: '100%',
    height: 40,
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxLabel: {
    color: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  buttonCancel: {
    backgroundColor: '#FF3B30',
  },
  buttonOk: {
    backgroundColor: '#007AFF',
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF40',
  },
  modalOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  modalCloseButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#FF3B30',
    borderRadius: 5,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});

export default TaskPanel;